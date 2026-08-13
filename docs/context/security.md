# Segurança — rate limit, lockout e hardening HTTP

> Complementa o ADR [`rate-limiting-and-lockout.md`](../adr/rate-limiting-and-lockout.md),
> que detalha o *como* (chaves, janelas, alternativas). Aqui fica o *porquê* das escolhas e o
> que a execução ensinou.

---

## Rate limit e lockout

### Redis, não in-memory

Os dois mecanismos compartilham a mesma necessidade: um contador que sobreviva a restart do
processo e funcione mesmo se a app um dia rodar em mais de uma instância. In-memory
(`express-rate-limit` puro) resolveria o caso atual (single-instance), mas quebraria
silenciosamente no primeiro dia de scale-out e zeraria a cada deploy. Custo aceito: um serviço
novo nos overrides do Compose e mais uma peça de infra em produção.

### Rate limit por IP e lockout por conta são dois mecanismos, não um

Têm alvos diferentes. **Por IP** protege contra volume (DoS, scraping, spam de criação de
conta) sem se importar com qual conta é tentada. **Por conta** protege uma credencial
específica contra força bruta direcionada, mesmo vinda de IPs diferentes (credential stuffing
distribuído). Um não substitui o outro.

Existe ainda uma **terceira chave, por email destinatário**, em `forgot-password` e
`verify-email/resend`: ela fecha o furo do atacante que rotaciona IP para bombardear a caixa de
uma vítima específica — cada request vem de um IP novo (o limite por IP não vê nada), mas a
caixa do alvo recebe tudo e a reputação do domínio remetente queima.

### Lockout híbrido — janela fixa → backoff exponencial

`N` tentativas erradas consecutivas travam a conta por uma janela fixa; se, depois de a janela
liberar, a próxima também errar, o tempo dobra a cada ciclo até um teto. Reseta (contador **e**
nível de backoff) no login certo. Janela fixa sozinha é previsível e barata de testar, mas um
atacante que espera exatamente o tempo da janela nunca é penalizado mais que isso; o backoff
crescente fecha a lacuna sem punir o usuário legítimo que errou a senha uma vez (só entra em
jogo depois de ciclos repetidos).

### A checagem de lockout entra no ramo da senha CORRETA

Colocá-la antes de verificar a senha bloquearia toda tentativa assim que a conta trava, mas
romperia o espírito anti-enumeração dos gates de `bannedAt`/`status` (que só revelam o estado da
conta depois de a senha bater). A leitura certa: o rate limit por IP/email-alvo já cobre o
**volume**; o papel do lockout é impedir que uma senha eventualmente certa — vinda de stuffing
distribuído — complete o login dentro da janela. O estado (`failures`/`backoffLevel`/
`lockedUntil`) fica só no Redis, e a transição (`applyFailure`) é função **pura** — mesmo idioma
de `computeEffectiveFeatures` —, testável por unidade sem tocar Redis.

### Configuração: duas env vars por regra, não uma string composta

O ADR listava um nome só por regra (`RATE_LIMIT_LOGIN`, default "20 / 15 min"), mas o D8 exige a
janela configurável — e não existe no projeto parser para "contagem/janela" num valor só (ao
contrário de `JSON_BODY_LIMIT`, que reusa a lib `bytes`). Duas vars (`_MAX` + `_WINDOW_MS`),
mesmo idioma do `LOCKOUT_THRESHOLD`/`_WINDOW_MS`/`_MAX_MS` que o ADR já separava.

### Conta travada responde 429 genérico

Login com senha errada continua 401 genérico (nenhuma identidade estabelecida). Rate limit por
IP e lockout por conta devolvem o **mesmo** 429, sem indicar qual disparou nem confirmar a
existência da conta além do que as tentativas anteriores já revelam — mesmo espírito
anti-enumeração de `forgot-password`/`verify-email/resend`.

### Desbloqueio manual pelo admin, e reset completo

Um usuário legítimo travado (esqueceu a senha e errou várias vezes antes de pedir reset) não
deveria esperar o backoff vencer sozinho. O desbloqueio (`manage:user:status`, mesma feature do
ban/unban) limpa contador **e** nível de backoff — mesmo idioma de unban: restaura o estado
anterior, não deixa resíduo. Não existe "lock manual" pelo admin (lock só acontece
automaticamente) — fora de escopo, registrado no [backlog](../reference/backlog.md).

### Destravar alvo privilegiado exige ator admin

Destravar não concede privilégio novo, mas **remove uma proteção** sobre a conta-alvo. Um
manager comprometido poderia destravar uma conta admin no meio de um ataque de força bruta,
anulando o lockout bem na hora em que ele mais protege — mesmo raciocínio de escalação lateral
de `assertAdminForBan`. Ver [authorization.md](authorization.md#não-escalação).

### Conta demo isenta do lockout (8.8)

Bug de produção descoberto pós-deploy da Fase 7: como a senha do demo é **pública**, o lockout
por conta (que ignora origem) vira um DoS contra a própria porta de entrada do projeto — ao
contrário do rate limit por IP, que continua valendo. Isenção identificada pela **role `demo`**,
não por email, sem custo de query extra (`findUserByEmail` já traz `roles` no mesmo fetch do
`login()`). O critério é simples de propósito (K28): basta ter a role, aceitando que conceder
`demo` a uma conta real a isentaria também. Alternativa descartada (demo-reset limpando
`lockout:*`) no ADR.

### Rate limit dos fluxos novos vive no service, não em middleware (8.7)

`rateLimitByEmailTarget` lê `req.body.email` **antes** do controller, e nenhum dos dois pontos
novos cabe nisso: o signup só deve consumir no *ramo* de reativação (não em todo cadastro), e
`POST /users/:id/reactivate` não recebe email nenhum no request. Em vez de duplicar o limitador,
`enforce()` parou de depender de `res` — o 429 passou a carregar o `Retry-After` no próprio
`AppError` (campo `headers`), aplicado pelo error handler central, que já era o ponto único de
saída desde a 7.5. É isso que permite chamar `consumeEmailTargetLimit` de dentro de um service,
que por camada não enxerga `Request`/`Response`.

### O admin divide o balde com o `forgot-password` (K27)

O orçamento é do **email**, não do ator. Um balde separado para a rota autenticada somaria na
caixa da mesma vítima e furaria a proteção que o limite por email-alvo existe para dar. O preço
— um admin legítimo pode levar 429 porque um terceiro gastou o orçamento daquele endereço — é
bloqueio temporário numa ação rara, e a `rule` no audit distingue a origem. No caminho do admin o
consumo vem **depois** de todos os guards: pedido recusado não gasta orçamento alheio.

### As três rotas públicas de token ganharam limite juntas (K26)

Proteger só a rota nova de confirmação deixaria duas irmãs idênticas — públicas, consumindo token
opaco — desprotegidas sem razão de negócio que as distinga. Balde **próprio** (`tokenIpLimiter`),
não o de envio de email: enviar email e consumir token são superfícies diferentes, e compartilhar
faria um reset legítimo comer o orçamento do outro.

---

## Fail-open e o que a execução ensinou

### Fail-open quando o Redis cai é risco aceito, não esquecido

Redis indisponível → rate limit e lockout são ignorados, o request segue, e a falha emite `error`
no application log (e no Sentry). Fail-closed (503 nas rotas de auth) eliminaria a janela sem
proteção, mas transformaria o Redis em ponto único de falha do **login inteiro** — um restart do
container derrubaria a autenticação. Disponibilidade do fluxo principal vence; a mitigação é a
falha ser barulhenta, não silenciosa.

### O fail-open não sai de graça só por estar decidido (7.0)

Ele depende de o client Redis **falhar rápido**. Com o default do ioredis, um comando emitido
enquanto o Redis está fora do ar fica na fila de offline esperando reconexão, e o login pendura
em vez de seguir: o fail-open viraria **fail-hang**. Por isso o client sobe com
`enableOfflineQueue: false` e `maxRetriesPerRequest: 1` (e os timeouts da 7.12 fecham o caso do
Redis que aceita a conexão e não responde). Verificado derrubando o container com a app no ar:
`/status` 200 e login 401, nunca 5xx.

### Isolamento de teste do Redis é por arquivo, não global

Contador de rate limit vaza entre testes, então todo arquivo de integração que autentica chama
`flushRedis()` (`tests/helpers/redis.ts`) no próprio `afterEach`. Fazer isso num `setupFile`
global falhou de um jeito não-óbvio: o `afterEach` global corria antes de a conexão real do
ioredis terminar o handshake nos testes **unitários** (rápidos, na casa dos ms) e os derrubava com
erro de `enableOfflineQueue`. Escopado por arquivo, fica no mesmo idioma explícito do
`clearDatabase()` que a suíte já usa.

---

## Hardening HTTP

### `app.set("trust proxy", 1)` (D7)

O deploy tem proxy reverso na frente, então `req.ip` sem isso é o IP do proxy — o mesmo para todo
mundo. Rate limit por IP, `Session.ipAddress` e o `ip` do audit log passariam a registrar (e
limitar) uma origem só, quebrando os três de uma vez, em silêncio. O `1` é literal e não `true`:
confia em **um** salto, o proxy que sabemos existir; `true` confiaria na cadeia inteira de
`X-Forwarded-For`, que o cliente pode forjar.

### Corpo grande demais é 413

Com `express.json({ limit })` ligado, o body-parser lança `entity.too.large`, que ninguém mapeava
— a API respondia **500** a um request que ela mesma recusou de propósito (mesmo tipo de furo do
JSON malformado, corrigido na 4.5). 413 é o status que existe para isso; 400 perderia a distinção
entre "JSON quebrado" e "JSON grande demais", e 422 é para corpo bem-formado com semântica
inválida — aqui o corpo nem chega a ser lido. A mensagem é genérica: não revela o teto configurado.

### CORS de origem não-permitida responde sem os headers, não com erro

Quem bloqueia uma origem estranha é o **navegador**, que só precisa da ausência de
`Access-Control-Allow-Origin`; lançar ali viraria 500 numa requisição que a API atendeu
corretamente. Request sem `Origin` (curl, Bruno, a própria suíte) passa — CORS não é autenticação
e não deve virar uma.

### Auto-hospedar o bundle do Scalar em vez de allowlistar o CDN

`helmet()` traz CSP com `script-src 'self'`, que bloqueia o `cdn.jsdelivr.net` de onde o
`/reference` carregava o Scalar. Allowlistar o CDN seria uma linha, mas autorizaria um terceiro a
executar script na própria origem — enfraquecendo exatamente o que o helmet foi ligado para dar.
Servir o bundle do próprio domínio mantém a CSP estrita e faz o `/reference` funcionar sem
internet. Custo: um asset no build e atualização manual quando o Scalar subir de versão.

Servido pela rota pública `GET /scalar/standalone.js` (router de topo, `Cache-Control` de 7 dias),
com o caminho resolvido **em runtime** (`createRequire(...).resolve` na raiz do pacote +
`browser/standalone.js`, porque o subpath não está no `exports` do `@scalar/api-reference`) — assim
dev (tsx) e produção (bundle do tsup) usam o mesmo código. `withDefaultFonts: false` e
`telemetry: false` completam a promessa: a página não faz chamada a terceiro por design.

### A auto-hospedagem sozinha não bastou — o nonce é a segunda peça (7.1)

A análise original concluía que "um nonce não resolveria, porque o script continua sendo externo".
Verdadeiro para o script do CDN e **insuficiente** na prática: com o bundle auto-hospedado, sobrou
um segundo script — o Scalar inicia por um `<script>` **inline**
(`Scalar.createApiReference(...)`), que `script-src 'self'` também bloqueia. Sem nonce,
`/reference` responde 200 com a UI em branco: falha invisível para `curl` e para qualquer teste que
só cheque status. As duas peças são necessárias — auto-hospedagem para o bundle, **nonce por
request** para o init inline (nunca `'unsafe-inline'`, que anularia a proteção). Daí também a regra
de validar CSP no navegador, não no terminal.

### Sobram violações de CSP no console de `/reference`, e elas ficam

Três coisas continuam bloqueadas e nenhuma quebra a UI: um `eval` que o bundle usa como *feature
detection* (com fallback), um `<script>` que ele injeta em runtime sem repassar o nonce, e as
chamadas ao diretório público de APIs do próprio Scalar (`api.scalar.com`). Silenciá-las custaria
`'unsafe-eval'` (a diretiva mais perigosa da CSP) e um `connect-src` para terceiro — preço alto
para trocar ruído de console por segurança real. Ficam documentadas em `src/docs/reference.ts` como
esperadas, para não serem lidas como regressão depois.

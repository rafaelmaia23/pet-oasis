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

### `trust proxy` é por endereço de origem, não por contagem de saltos (D7, revisto na 10.2)

O deploy tem proxy reverso na frente, então `req.ip` sem `trust proxy` é o IP do proxy — o mesmo
para todo mundo. Rate limit por IP, `Session.ipAddress` e o `ip` do audit log passariam a
registrar (e limitar) uma origem só, quebrando os três de uma vez, em silêncio.

A primeira forma disso foi `app.set("trust proxy", 1)`: um salto, o proxy que sabemos existir.
**Ela deixou de servir na 10.2**, quando um cliente que renderiza no servidor (o front web) passou
a chamar a API em nome do visitante. A partir daí duas cadeias vivem ao mesmo tempo —
`visitante → nginx → api`, com um salto, e `visitante → nginx → front → api`, com dois — e
**nenhuma contagem única acerta as duas**: `1` grava o container do front, `2` grava o nginx
quando a chamada não passou pelo front. Contar saltos pressupõe uma topologia só.

A forma que serve as duas é confiar por **endereço**:

```ts
app.set("trust proxy", ["loopback", "uniquelocal"]);
```

O Express caminha o `X-Forwarded-For` da direita para a esquerda pulando endereços confiáveis e
para no primeiro que não é. Consequência de contrato, deliberada: o cliente pode **copiar** o
header que recebeu ou **acrescentar** o próprio salto, tanto faz — transformar um detalhe de
implementação do cliente em pré-requisito de segurança da API seria acoplamento gratuito. O
contrato do lado do cliente está em
[`guides/integrating-with-the-api.md`](../guides/integrating-with-the-api.md).

**O que torna isso seguro é a porta 3000 não ser publicada no host em produção** (10.2, no
`infra/docker-compose.prod.yml`). Confiar em endereço privado com a porta publicada seria o furo
que `true` sempre foi: qualquer um forjaria o próprio IP e furaria rate limit, lockout e audit log
de uma vez. Sem publicação, uma conexão vinda da internet direto na API não existe — quem alcança
a API por endereço privado é só o nginx e os containers das redes declaradas. As duas mudanças são
**uma decisão só**, e é por isso que republicar a porta "só para depurar" reabre o buraco.

Chamada que **não** é em nome de um visitante (job, health check, script) não manda o header, e aí
o IP registrado é o do próprio cliente — que é o correto.

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

### A allowlist de CORS sai só da variável explícita — a `APP_URL` não entra por inércia (10.11)

Na Fase 7 a allowlist nasceu como `[APP_URL, ...CORS_ALLOWED_ORIGINS]`: a URL pública do cliente
entrava sozinha, por ser presumidamente quem chama por navegador. A Fase 10 desfez isso. Depois
da migração de domínio a `APP_URL` é o front, e o front adota BFF — quem fala com a API é o
servidor dele, e a requisição chega **sem `Origin`**. A entrada automática viraria permissão
concedida a um consumidor que não existe, e permissão que ninguém pediu é permissão que ninguém
revisa. Hoje `src/config/cors.ts` monta a lista **só** de `CORS_ALLOWED_ORIGINS`, e a lista vazia é o
estado esperado enquanto o único cliente for o front com BFF. O middleware e a variável ficam para o dia em que houver uma página web de outra
origem chamando a API direto do JavaScript — esse é o único cliente que precisa de CORS. App
mobile nativo **não** é motivo para reabrir a allowlist: não há navegador, não há preflight. A
tabela de quem precisa e quem não precisa está em
[`guides/integrating-with-the-api.md`](../guides/integrating-with-the-api.md#3-cors-quando-se-aplica-e-quando-não).
A `APP_URL` continua existindo, mas só para o que sempre foi dela: os links dos emails.

### Mass assignment: schema de update é `.strict()`, e a proteção tem teste próprio (10.12)

O que só o sistema escreve — estado da conta, marca de banimento, `mustChangePassword`,
`passwordHash`, vínculo de papel, `deletedAt`, dono de um recurso — nunca pode chegar pelo corpo
da requisição. A defesa está no schema, não no service: todo schema de **update** é `.strict()`
(chave desconhecida → 422 nomeando a chave em `errors.body`, e a requisição inteira é recusada,
inclusive o campo legítimo que veio junto), e o que o endpoint recusa de propósito tem `z.never`
com mensagem própria (`cpf`, `email`, `roleNames` no user; `customerId`, `deceasedAt` no pet;
`logoPath` na marca). Os schemas de **create** e o `PUT` do override ficam no modo padrão do Zod,
que *descarta* a chave desconhecida — e é o corpo parseado, não `req.body`, que segue para o
service, então a chave descartada não existe mais quando o Prisma monta o `data`.

O levantamento da Fase 10 não achou schema permissivo. O que faltava era o teste: essa é a
classe de proteção que se perde em silêncio num refactor (um `.strict()` que vira `.strip()`, um
`.extend()` na ordem errada, um `data: req.body` num controller novo) e que ninguém nota até virar
incidente. `tests/integration/v1/mass-assignment.test.ts` cobre cada endpoint de escrita que
recebe corpo — os sete `PATCH`, o `PUT` do override, e os `POST` que criam conta ou perfil ou
alteram estado (`signup`, `users`, `ban`, `reactivate`, `change-password`, `change-email`,
perfil de cliente) — com um caso que prova as duas metades. Nos `.strict()`, a chave privilegiada
é recusada **por nome** e a linha é idêntica à de antes (a recusa é da requisição inteira, o campo
legítimo que veio junto também não entra). Nos strip, a resposta é de sucesso e a coluna carrega o
valor **do sistema** — `PENDING` no signup, o relógio e o ator no ban, `pendingEmail` e não
`email` na troca de endereço —, nunca o do corpo; por isso cada probe manda um valor distinto do
default, senão a asserção seria vácua. O vermelho foi verificado trocando `.strict()` por
`.strip()` em dois schemas: os dois casos falharam apontando a chave que passou a entrar. Schema
de escrita novo entra nesse arquivo no mesmo commit em que nasce — regra apontada em `CLAUDE.md`,
que é onde quem cria schema lê.

### Todo campo de texto tem teto, e o teto é contrato (10.13)

O limite total de corpo (`JSON_BODY_LIMIT`, 100kb) protege o agregado, mas nada impedia quase
todo ele dentro de um único campo: 99KB num `email` de login passavam pelo `z.email()` (o regex
não tem tamanho), iam ao banco, inchavam o índice único e, agora que existe log estruturado,
viravam uma linha de log de 99KB. A defesa é a mesma do mass assignment — no **schema**, não no
service: todo campo de texto tem `.max()`, e acima dele a resposta é 422 nomeando o campo, o
mesmo shape de toda validação sintática.

Nenhuma coluna do Prisma declara tamanho (`String`, nunca `@db.VarChar`), então "coerente com a
coluna" virou "coerente com o que o campo representa", e o motivo de cada teto está gravado ao
lado da constante. Os do catálogo e do pet já nasceram com teto (9.4–9.9); o que faltava era
identidade e sessão, e cada um tem um número que se **deriva**, não que se escolhe: email 254 é o
caminho máximo do RFC 5321; senha 100 é o teto do `passwordSchema` reaplicado onde ela é só
conferida — senha maior nunca foi gravada, então nunca vai bater, e recusar antes do bcrypt não
muda o resultado, só o custo; token 64 é o hex dos 32 bytes que `generateOpaqueToken` emite, e a
constante mora ao lado do gerador para que mudar um mude o outro; `targetId` 36 é o uuid que todo
audit grava; `cursor` 128 é folga sobre os 100 do base64url de `{ c, i }`. CPF 14 e telefone 20
são as **máscaras** (`000.000.000-00`, `+55 (11) 9 8765-4321`), e o `.max()` fica **antes** do
`transform` que tira os separadores — de propósito: o teto é sobre o que o cliente digita, senão
onze dígitos afogados em 99KB de hífen passariam pelo `length(11)` de depois.

As peças ficaram **uma por conceito** (`emailSchema`, `cpfSchema`, `phoneSchema` em
`user.schema.ts`; o teto de senha conferida e o de token em `auth.schema.ts`): o telefone estava
copiado três vezes (signup, perfil de cliente, reativação), e três cópias com teto seriam três
lugares para o teto divergir. O teto sai no `/openapi.json` como `maxLength` de graça, porque a
spec é gerada dos schemas — e é contrato: `openapi.test.ts` afirma uma amostra de cada classe
(corpo, texto cru com máscara, query), para que um teto removido num refactor fique vermelho na
spec, e não só num teste de módulo. Cada schema tocado tem o próprio teste, no arquivo do módulo,
com o valor **acima** do teto: nada de teste-monólito varrendo schemas — a varredura foi o
trabalho, o teste é a regressão. Campo de texto novo nasce com `.max()`, e a regra vive em
`CLAUDE.md`, ao lado da do `.strict()`.

O que **não** entrou, de propósito: `User-Agent` e `X-Forwarded-For` vão para `Session` e
`AuditLog` sem teto próprio — são header, não campo de schema, e o único teto hoje é o do Node
(`--max-http-header-size`, 16KB). E os inteiros sem `.max()` (`stockQuantity`, `weightGrams`,
`volumeMl` da variante) não são texto, mas um valor acima de 2³¹ estoura o `Int` do Postgres
antes de virar 422. Os dois estão no backlog.

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

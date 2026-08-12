# Observabilidade — logs, audit trail, destinos e timeouts

> A **política** (as três categorias lado a lado, taxonomia fechada de ações, dados proibidos,
> retenção) é fonte única em [`reference/logging-policy.md`](../reference/logging-policy.md) —
> não duplicar aqui. Este arquivo guarda o *porquê* das escolhas.

---

## As três categorias

### Por que três e não uma

Access log (tráfego), application log (o que aconteceu dentro do processo) e audit log (quem fez
o quê, em quem) têm emissor, volume, destino, mutabilidade e ciclo de vida diferentes.
Misturá-los faz cada um herdar o pior do outro: o log de negócio afogado em ruído de tráfego, e o
log de tráfego pagando o custo de escrita transacional no banco.

### `AsyncLocalStorage` é exceção consciente a "explicit over implicit"

Correlacionar as três categorias exige um `requestId` disponível em qualquer camada. A
alternativa explícita seria passar um `context` em toda assinatura de service — dezenas de
assinaturas poluídas para entregar um valor usado só no fundo da pilha. A exceção fica
**limitada ao contexto de observabilidade**: nenhuma regra de negócio lê do store.

### O ambiente de teste não silencia o logger — ele não monta o stdout

`LOG_LEVEL=silent` deixaria a suíte limpa, mas impediria testar qualquer linha, e a política
depende de teste para valer. Com os destinos escolhidos por ambiente, o test escreve **só no ring
buffer**: saída limpa e linhas assertáveis, sem mock, pelo mesmo mecanismo que `GET /logs/recent`
expõe.

### O `requestId` volta ao cliente

No header `x-request-id` e no corpo de toda resposta de erro. Sem isso, a correlação existe mas é
inalcançável a partir do relato de um usuário ("deu erro ontem"); com ela, o id citado recupera
access, application e audit log daquele request. O id não é segredo, e o corpo de erro continua
sem stack.

### A rota do access log vem do contexto, não de `req.url`

O Express reescreve `req.url` ao descer nos routers montados, e o access log só sai no fim do
request — `/api/v1/status` chegava como `/`, e a regra de rota-de-ruído (o healthcheck do Compose,
que bate a cada 5s) nunca casava. Um caso em que o teste **do comportamento**, não do código, foi o
que pegou.

---

## Audit log

### Endpoint de leitura — decisão anterior revertida

O plano original adiava `GET /audit-logs` para uma fase futura, deixando a trilha consultável só
via banco. Revertido: uma trilha que só o mantenedor consegue ler não demonstra nada num projeto de
portfólio, e a regra de PII da política (`metadata` só com ids e enums) foi tomada justamente para
tornar a leitura segura. O endpoint entra com paginação **cursor** e filtros, e é **só `GET`** — a
ausência de `PATCH`/`DELETE` é imutabilidade intencional, coberta por teste.

### `read:audit-log:full` e não uma role como âncora

O `ip` sai mascarado (`192.168.1.***`) por padrão; a feature destrava o valor inteiro. Segue o
padrão `ação:recurso:modificador` já usado no catálogo (`read:user:others` — o modificador nem
sempre é `:others`). Assim o mascaramento vira demonstração de RBAC dentro da própria resposta (o
demo lê a trilha e vê IP mascarado; um admin vê inteiro), e a visibilidade de IP fica concedível
por override sem carregar junto o poder de banir que reusar `manage:user:status` traria. Features
novas no singular, como o resto do catálogo: **`read:log`** (ring buffer) e **`read:audit-log`**
(+ `:full`). Por destravar PII, `read:audit-log:full` entrou em `PRIVILEGED_FEATURES` —
ver [authorization.md](authorization.md#não-escalação).

### Escopo 12/18 na primeira leva (7.6)

A sessão ligou só os pontos cujo código já existia; os 6 restantes (lockout, rate limit, forçar
senha, troca de email, demo-reset) ficaram para as sessões seguintes, como a coluna "Sub-fase" da
taxonomia já atribuía. A taxonomia inteira foi declarada como **union em tempo de compilação**
para as futuras já validarem. Hoje são 24 ações.

---

## Destinos

### O ring buffer existe mesmo havendo Axiom

É a única leitura de log disponível *de dentro da API*, sem conta de terceiro — o que torna a
observabilidade demonstrável para quem avalia o projeto. As limitações (é por processo, some no
restart) são declaradas no `meta` da própria resposta, em vez de escondidas.

### Axiom e Sentry entram mesmo sem conta configurada

Ambos ativam só se as env vars existirem; ausentes, a app degrada para stdout + ring buffer e
**boota normalmente**. O subsistema de log nunca pode derrubar a aplicação — nem no boot, nem no
request. Por isso o Axiom vai em **worker thread**, fora do caminho síncrono, com `flush` no
shutdown: senão os últimos logs antes do SIGTERM se perdem justamente quando mais importam.

No Sentry, só falha de verdade é capturada (≥500, não-tratado, `unhandledRejection`,
`uncaughtException`): um 404 ou 422 é comportamento correto da API, não incidente. E o `beforeSend`
replica a lista de campos proibidos do `redact` — reusando as constantes exportadas de `logger.ts`,
para não existir uma segunda lista que diverge —, senão o Sentry vazaria pela porta dos fundos o
que a política protege na porta da frente.

**Gotcha do empacotamento:** o `release` do Sentry lê a versão do `package.json` via
**`process.cwd()`**, não por caminho relativo ao módulo — o tsup achata `src/lib/sentry.ts` dentro
de um `dist/server.js` só, e o cwd é a única referência estável entre dev, teste e produção.

---

## Higiene e resiliência

### Teto de sessões e faxina de tokens são higiene, não perda de auditoria

O teto (`MAX_LIVE_SESSIONS`, default 5) evita acumular sessões vivas indefinidamente — ao exceder,
a **mais antiga é invalidada** e o login segue; recusar o login puniria o usuário por uma regra de
higiene interna. A faxina faz **hard delete** (não soft) de `Session`/`VerificationToken` mortos há
tempo suficiente: são registros técnicos, não dados de negócio, e o rastro de auditoria de verdade
vive no `AuditLog`.

**Critério de "morto" (firmado com o usuário):** conta a partir de **qualquer** timestamp de morte
— `expiresAt` vencido **ou** `usedAt` **ou** `invalidatedAt`, checados de forma independente —, não
só do `expiresAt` natural: uma sessão revogada há meses já é lixo mesmo com `expiresAt` no futuro.

### Timeout em toda dependência externa (7.12)

Sem timeout, uma dependência pendurada exaure o pool e derruba a app inteira — o modo de falha mais
comum em produção e o menos exercitado em teste. Cobre:

- **HTTP server** — `headersTimeout`/`requestTimeout`/`keepAliveTimeout`, setados logo após
  `listen()` (`requestTimeout` > `headersTimeout` é exigido pelo próprio Node). O keep-alive fica
  **acima** do que proxies reversos tipicamente mantêm (~60s), evitando a race clássica de o backend
  fechar um socket ocioso que o proxy acabou de reaproveitar.
- **Prisma** — `transactionOptions.maxWait`/`timeout` no `PrismaClient`, aplicado a toda
  `$transaction()`.
- **Redis** — `connectTimeout`/`commandTimeout`, sem os quais o fail-open é ilusório: um Redis que
  aceita a conexão mas não responde penduraria o login.
- **SMTP** — `connectionTimeout`/`greetingTimeout`/`socketTimeout` no transporter do nodemailer.
  Não `AbortSignal`, que seria o mecanismo se o envio fosse pela API HTTP da Resend em vez de SMTP.

Todos por env var, com defaults conservadores (`SERVER_HEADERS_TIMEOUT_MS=65000`,
`SERVER_REQUEST_TIMEOUT_MS=70000`, `SERVER_KEEP_ALIVE_TIMEOUT_MS=61000`,
`PRISMA_TX_MAX_WAIT_MS=5000`, `PRISMA_TX_TIMEOUT_MS=8000`, `DB_POOL_CONNECT_TIMEOUT_MS=5000`,
`REDIS_CONNECT_TIMEOUT_MS=2000`, `REDIS_COMMAND_TIMEOUT_MS=2000`, `SMTP_CONNECTION_TIMEOUT_MS=10000`,
`SMTP_GREETING_TIMEOUT_MS=5000`, `SMTP_SOCKET_TIMEOUT_MS=20000`).

**Correção sobre o planejamento original:** o item falava em "timeout de pool na connection
string", mas o projeto usa `@prisma/adapter-pg` (driver adapter), não o pool nativo do Prisma — os
parâmetros clássicos de URL (`connection_limit`, `pool_timeout`) não são lidos por esse caminho. O
timeout de aquisição de conexão é `connectionTimeoutMillis`, campo irmão de `connectionString` no
`pg.PoolConfig` passado ao `PrismaPg`. O objetivo é o mesmo; só a forma de configurar mudou.

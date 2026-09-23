# Timeout em toda dependência externa (7.12)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Observabilidade** › *Higiene e resiliência*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

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

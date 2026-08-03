# pet-oasis — TODO (Ciclo 1)

> Estado e ordem das tarefas. Consulte antes de começar; atualize ao concluir.
> Detalhes de decisões em `docs/context.md`. Regras de negócio firmadas no `CLAUDE.md`.

## Legenda
✅ feito · 🔄 em andamento · ⬜ a fazer · 🔸 polimento (não bloqueia)

---

## Fase 2 — Autorização e perfis ✅
> RBAC + CRUD de user com modelo de perfis. Regras e racional no `docs/context.md` (§1, §2).
- Autorização: `computeEffectiveFeatures` (pura) + `can`/`hasFeature`/`canActOnResource`; middleware `authenticate`; autorização-antes-da-busca (403 vence 404).
- CRUD de user: POST / GET lista / GET :id / PATCH / DELETE; `createCustomer`/`createEmployee` (nested write); soft delete (`softDeleteUserAndInvalidateSessions`).
- Módulos read-only: role (`GET /roles`, `/roles/:id`) e feature (`GET /features`, `/features/:id`).
- Overrides de feature: `PUT`/`DELETE /users/:userId/features/:featureId`; não-escalação (`assertAdminForPermissionFeature`).
- Perfis: `POST`/`DELETE /users/:userId/customer|employee` (transação; recusa deleção do último perfil ativo; 204).
- Vínculo user↔role: `GET`/`POST`/`DELETE /users/:userId/roles/:roleId`; não-escalação generalizada (`assertAdminForRoleAssignment`).
- Permissions efetivas + me: `GET /users/:userId/permissions` (`string[]`); `GET /me` (view `me`).
- Soft delete de UserRole/UserFeature (id próprio como PK, unicidade do ativo por código).

---

## Fase 3 — Auth alvo (access JWT + refresh opaco rotativo) ✅
> Migrou de "JWT-como-Session validado no banco a cada request" para "access JWT 15min validado local + refresh opaco rotativo". Design e racional no `docs/context.md` (§2, §3).
- `Session` reshaped: `refreshTokenHash`/`usedAt`/`userAgent`/`ipAddress` (sem `token`). `src/lib/token.ts` (gera/hash opaco).
- `authenticate` reescrito (valida JWT só localmente, sem hit no banco), movido de global → por-grupo-de-rota; erros via `create*Error` (idem `canAccess`).
- Endpoints: `POST /auth/login` (sempre cria Session nova), `POST /auth/refresh` (rotação + detecção de roubo por reuso → invalida todas as sessões), `POST /auth/logout` (por refresh cookie + ownership), `GET /auth/sessions` (só vivas), `DELETE /auth/sessions/:id` (404 unificado "não existe/morta").
- Features `read:session`/`manage:session` (substituem `logout:session`).
- Distinção de critério `invalidateAllUserSessions` (resposta a roubo, mantém `usedAt`) vs `softDeleteUserAndInvalidateSessions` (encerra conta, filtra `usedAt`).

---

## Fase 4 — Email, status de conta e banimento ✅
> Status de conta com verificação de email obrigatória, serviço de email genérico (nodemailer; mailpit em dev / Resend em prod), recuperação/troca de senha e banimento. Regras e racional no `docs/context.md` (§2.1, §4).
- Modelo de status: `enum UserStatus { PENDING, ACTIVE }` + `bannedAt`/`bannedBy`/`banReason` ortogonais (idioma `deletedAt`); loga só com `status == ACTIVE && bannedAt == null`; desbanir limpa as três colunas e preserva o `status`.
- `VerificationToken` genérico (`purpose: EMAIL_VERIFICATION | PASSWORD_RESET`, hash salvo, TTL por purpose) + `src/lib/email.ts` (`send`, erro → 503).
- Verificação: todo user novo nasce `PENDING` (signup e `POST /users`); `POST /auth/verify-email` (204) + `/verify-email/resend` (sempre 200 genérico); orquestração em `verification.service.ts` (evita ciclo `auth`↔`user`); token ruim → 400 genérico.
- Recuperação/troca de senha: `POST /auth/forgot-password` (200 genérico) + `/reset-password` (204, token single-use, invalida TODAS as sessões) + `/change-password` logado (403 se senha atual errada, também invalida todas as sessões).
- Banimento: `POST`/`DELETE /users/:id/ban` `{ reason }` (`manage:user:status`); `assertAdminForBan` (features efetivas do alvo, não da role); auto-ban/-unban → 409; conta banida = "congelada" (login/forgot/resend/reset/change bloqueados, sessões derrubadas), **204** em ambos.
- Fechos: 2 bugs pré-existentes corrigidos — `getUserById` passou a autorizar antes de buscar (403 vence 404) e JSON malformado do body-parser virou **400** (era 500). Adotado o fluxo de branches por fase (`main` → `fase-<n>` → `feat/...`). Nasceu o `docs/endpoints.md`.
- Suíte (329) + `typecheck` + `lint` verdes ao fechar.

---

## Fase 5 — Documentação da API + Containerização (deploy) ✅
> Fecha o Ciclo 1 como peça de portfólio: OpenAPI gerado dos schemas Zod → UI Scalar → coleção Bruno, usuário demo read-only, e deploy via Docker do zero. Racional no `docs/context.md` (§2.3, §4).
- OpenAPI 3.1 via `zod-openapi` + `.meta()` nativo do Zod 4 (sem monkey-patch) — schemas/presenters viram componentes nomeados; **`GET /openapi.json`** (público, router de topo, `servers: [{url:"/api/v1"}]`); doc verificada sem `passwordHash`/`tokenHash`/`refreshTokenHash`.
- UI Scalar interativa em **`GET /reference`** (público), consumindo `/openapi.json`, Bearer preenchível no "try it".
- Usuário demo read-only: role `demo` (`appliesTo EMPLOYEE`, só features de leitura) sempre semeada; usuário demo só nasce com `SEED_DEMO_USER=true` (ligado em Docker/prod, desligado em test/dev).
- `README.md` (novo) e coleção **Bruno** versionada em `api-collection/` (por módulo, environments `local`/`prod`); login encadeia o token via `bru.setVar` (não `setEnvVar` — não grava segredo no `.bru` versionado).
- Containerização: `Dockerfile` multi-stage não-root (client Prisma embutido no bundle via tsup, `src/generated` não copiado ao runtime); serviço `app` no compose sob profile `full`, derivando a própria `DATABASE_URL` (`@db`); entrypoint `migrate deploy → seed → start` (seed bundlado, `dist/seed.js`). Deploy documentado no `README.md`.
- Suíte (335) + `typecheck` + `lint` verdes ao fechar; nasceu o `docs/endpoints.md` § "Docs".

---

## Fase 6 — Ambientes, Docker por ambiente e deploy ✅
> Reformula dev/test/prod para Compose base + overrides por ambiente, corrige dois bugs de deploy (SMTP hardcodado pro mailpit em vez da Resend; prod subindo db/mailpit de dev) e adiciona graceful shutdown. Nenhuma regra de negócio nova. Racional no `docs/context.md` (§2.4, §4) e ADR `docs/adr/environments-and-deploy.md`.
- Envs por arquivo: `.env.{development,test,production}` (fora do git) + `.env.example`; `dotenv-cli` na autoria de migration; `vitest.config.ts` carrega `.env.test` (`npx vitest run <arquivo>` funciona sozinho).
- `src/lib/shutdown.ts` (`createShutdownHandler`, injeção de dependência): `server.close()` → `prisma.$disconnect()` → exit, timeout de força-saída; `server.ts` registra SIGTERM/SIGINT.
- Compose **base + overrides** (`.dev`/`.prod`/`.test`), isolados por `-p pet-oasis-{dev,test,prod}`: prod só `app` + Postgres-de-prod (mata os dois bugs); dev com bind-mount + client Prisma em volume anônimo; stage `dev` do Dockerfile roda como root (evita EACCES no bind-mount).
- Scripts por ambiente: `dev`/`dev:down`/`dev:reset`/`dev:mail`, `prod:up`/`prod:down`/`prod:logs`, `test` (teardown garantido por trap de EXIT) — substituem os antigos `services:*`/`stack:*`.
- Teste-guarda `clearDatabase.guard.test.ts` (Feature/Role/RoleFeature sobrevivem ao `clearDatabase` de propósito — não era bug).
- `typecheck` + `lint` + suíte verdes; verificação ponta a ponta dos 3 ambientes ao fechar.

---

## Fase 7 — Hardening e polimento ✅

> Amplia o escopo original ("rate limiting, account lockout") para incluir também observabilidade e polimento de features já construídas. Decisões e racional completos no `docs/context.md` (§2.2), em `docs/logging-policy.md` e nos ADRs `rate-limiting-and-lockout.md` / `pagination.md`. Cada sub-fase é uma feat-branch em TDD (`feat/fase-7-<m>-<slug>` → merge `--no-ff` na `fase-7`).
>
> **Reorganização em relação ao plano anterior:** o antigo item único "audit log" virou **três categorias de log** com sub-fases próprias (access / application / audit); a paginação foi **movida para antes** dos endpoints de leitura, para ser extraída como helper reutilizável (a Fase 9 depende dela); o audit log **ganhou endpoint de leitura** (decisão anterior revertida); entraram itens novos de hardening (rate limit por destinatário, timeouts) e o reset do ambiente demo.

### Decisões firmadas no planejamento da fase

| # | Decisão | Escolha |
|---|---|---|
| D1 | 7.18 "refresh token hasheado" | **Já implementado desde a Fase 3** (`Session.refreshTokenHash` = sha256, `src/lib/token.ts`). Rebaixada a teste de regressão na 7.19. HMAC com PEPPER analisado e recusado → `docs/backlog.md`. |
| D2 | Redis indisponível | **Fail-open.** Rate limit e lockout são ignorados, o request segue, a falha emite `error` (+ Sentry). O Redis não vira SPOF do login. |
| D3 | CSP × Scalar | **Auto-hospedar o bundle** do Scalar → `script-src 'self'` de verdade, `/reference` funciona offline. |
| D4 | Envelope de paginação | `{ data, meta }` em **todas** as listagens (breaking change assumido de uma vez). Exceção: `GET /users/:userId/permissions` segue `string[]`. |
| D5 | IP no `GET /audit-logs` | Feature **`read:audit-log:full`** destrava o IP inteiro; sem ela, mascarado. Catálogo novo, no singular: `read:log`, `read:audit-log`, `read:audit-log:full`. |
| D6 | Axiom + Sentry | **Ambos** na fase, ativando só com as env vars presentes; ausentes → stdout + ring buffer, boot normal. |
| D7 | Trust proxy | Deploy tem proxy reverso na frente → `app.set("trust proxy", 1)`. |
| D8 | Valores numéricos | Aceitos os propostos, **todos por env var** (tabela no ADR de rate limiting; `limit` de paginação no ADR de paginação). |

O desenho de 7.15 (troca de email) e 7.16 (forçar troca de senha) foi **confirmado com o usuário antes da implementação** (2026-08-03) — decisões completas nas seções abaixo; racional em `docs/context.md` §2.2.

### Sessões de trabalho

As sub-fases mantêm a numeração `7.0–7.19`; as sessões agrupam-nas em blocos executáveis, **nesta ordem**:

| Sessão | Sub-fases | Tema | Por que agrupa |
|---|---|---|---|
| **A** ✅ | 7.0, 7.1, 7.2 | Fundação de infra + bordas + guards | Redis/env/deps, helmet+CORS+Scalar auto-hospedado e o refactor dos 3 guards. Nada aqui depende de log. |
| **B** ✅ | 7.3, 7.4, 7.5 | Observabilidade interna | Logger + `AsyncLocalStorage` + ring buffer são inúteis sem consumidor; access e application log são os consumidores. |
| **C** ✅ | 7.6 | Audit log | Migration + taxonomia + `auditLog.record` + ~18 pontos de chamada. Grande sozinha. |
| **D** | 7.7, 7.8 | Paginação + leitura de log | 7.8 consome o helper da 7.7 (cursor em `/audit-logs`); a 7.7 já migra todas as listagens para o envelope. |
| **E** ✅ | 7.9, 7.10 | Rate limit + lockout | Mesma infra (Redis), mesmo endpoint alvo (`/auth/login`), mesmas ações de audit. |
| **F** ✅ | 7.11, 7.12 | Bordas externas e resiliência | Axiom/Sentry e os timeouts tratam o mesmo problema: dependência externa que falha ou pendura. |
| **G** ✅ | 7.13, 7.14 | Scripts de manutenção + agendamento | `cleanup-sessions`, `cleanup-audit-log` e `demo-reset` compartilham `--dry-run`, transação, log de resultado e systemd timer. |
| **H** ✅ | 7.15, 7.16, 7.17 | Polimento de features de conta | As três mexem no domínio de conta/sessão. **Abre confirmando o desenho de 7.15 e 7.16.** |
| **I** ✅ | 7.19 (+ regressão de D1) | Fechos | Docs, teste de regressão do refresh hash, suíte/typecheck/lint, fase ✅. |

### ✅ [Sessão A] Fase 7.0 — Fundação de infra
- ✅ Serviço `redis` (`redis:7-alpine`, healthcheck `redis-cli ping`) nos **três overrides**, não na base — os serviços de dado já viviam lá. Container/porta/volume próprios por ambiente: dev `6379` (volume `dev_redisdata`), **test `6380`** (sem volume — o teardown roda `down -v`), prod **sem porta publicada** (volume `prod_redisdata`). O `app` recebe `REDIS_URL: redis://redis:6379` pelo `environment` do override, mesmo idioma já usado na `DATABASE_URL`. `test:services:up` passou a subir `db redis`.
- ✅ `src/lib/redis.ts`: client ioredis com `enableOfflineQueue: false` + `maxRetriesPerRequest: 1` — **é isto que torna o fail-open (D2) real**; sem essas opções o comando ficaria enfileirado esperando reconexão e penduraria o login em vez de deixar o chamador seguir. `retryStrategy` com backoff limitado; listener de `error` só loga (o Redis nunca derruba o boot). `connectTimeout`/`commandTimeout` anotados como TODO da 7.12.
- ✅ `shutdown.ts` ganhou dep **opcional** `redis`, fechada depois do `prisma.$disconnect()`; falha do `quit()` só loga e **não** muda o exit code (um Redis já fora do ar não deve fazer todo shutdown sair 1).
- ✅ **`app.set("trust proxy", 1)`** (D7).
- ✅ `express.json({ limit: env.JSON_BODY_LIMIT })` (default `100kb`, por env var).
- ✅ **Bug pré-existente corrigido:** corpo acima do teto virava **500** (o erro `entity.too.large` do body-parser não era mapeado, igual ao caso do JSON malformado da 4.5). Agora → **413** `PAYLOAD_TOO_LARGE` (classe + factory novas), com mensagem genérica que não revela o limite configurado.
- ✅ Dependências instaladas de uma vez para a fase inteira: `ioredis`, `helmet`, `cors` (+ `@types/cors`), `rate-limiter-flexible`, `pino`, `pino-http`, `pino-pretty` (dev). As de log/rate limit só passam a ser usadas nas Sessões B/E.
- ✅ Env vars novas em `env.ts` + `.env.example` + os três `.env.*`: `REDIS_URL`, `LOG_LEVEL`, `LOG_BUFFER_SIZE`, `CORS_ALLOWED_ORIGINS`, `JSON_BODY_LIMIT`.
- ✅ Verificado em runtime: dev sobe com o Redis; **com o Redis derrubado a app segue respondendo** (`/status` 200, login 401 — nunca 5xx) e reconecta sozinha; SIGTERM fecha server + Prisma + Redis (“Shutdown complete.”); `curl` com corpo de 200 KB → 413.

### ✅ [Sessão A] Fase 7.1 — Helmet + CORS explícito
- ✅ `helmet()` com a CSP **mais estrita que o default** (`src/config/helmet.ts`): o preset libera `https:` e `'unsafe-inline'` em `style-src`/`font-src` — folga pensada para páginas HTML, inútil numa API JSON —, então as duas caem para `'self'`.
- ✅ **CSP × Scalar (D3) — bundle auto-hospedado:** `@scalar/api-reference` virou dep de runtime e o bundle é servido em **`GET /scalar/standalone.js`** (rota pública no router de topo, `Cache-Control` de 7 dias). O caminho é resolvido em runtime (`createRequire(...).resolve` na raiz do pacote + `browser/standalone.js`, já que o subpath não está no `exports`), então dev (tsx) e produção (bundle do tsup) usam o mesmo código — **verificado nos dois**. `reference.ts` passa `cdn: SCALAR_BUNDLE_PATH`.
- ✅ **Nonce era obrigatório, não opcional:** o Scalar inicia por um `<script>` **inline** (`Scalar.createApiReference(...)`) que `script-src 'self'` bloquearia — a página viria 200 com a UI em branco, exatamente o que o `curl` não pega. `docsCspNonce` gera um nonce base64url por request, a `docsCsp` o injeta em `script-src` e o `referenceHandler` (montado por request) o repassa ao Scalar. Coberto por teste: o nonce do header casa com o do `<script>` servido, e muda a cada request.
- ✅ CSP da doc escopada em `/reference` (a global segue estrita): `style-src 'unsafe-inline'` (o bundle injeta o CSS em runtime), `img-src`/`font-src` com `data:`. `script-src` **sem** `'unsafe-inline'` e sem CDN.
- ✅ `withDefaultFonts: false` e `telemetry: false` — sem webfont de `fonts.scalar.com` nem telemetria; a página não faz chamada a terceiro por design (e funciona offline).
- ✅ **Testado no navegador** (não só `curl`): a UI renderiza e o "try it" funciona. Restam **4 mensagens de CSP no console, esperadas e documentadas em `reference.ts`** — (1) `eval` bloqueado, que é um *feature detection* (`try { Function("") } catch {}`) com fallback; (2) um `<script>` que o bundle injeta em runtime sem repassar o nonce; (3–4) duas chamadas ao diretório público de APIs do Scalar (`api.scalar.com/vector/registry/*`). `hideSearch`/`telemetry` foram testados contra as chamadas ao registry e **não** as evitam; liberar `connect-src api.scalar.com` foi recusado (autorizaria um terceiro e mataria o offline), e `'unsafe-eval'` está fora de questão. São a CSP funcionando, não regressão.
- ✅ CORS (`src/config/cors.ts`): allowlist `APP_URL` + `CORS_ALLOWED_ORIGINS` (CSV), `credentials: true` (o refresh viaja em cookie). Origem fora da lista → resposta **sem** headers de CORS (não erro: quem bloqueia é o navegador, e lançar viraria 500); request sem `Origin` (curl, Bruno, suíte) passa.

### ✅ [Sessão A] Fase 7.2 — Consolidar guards de escalação
- ✅ `isAdmin` + `assertActorIsAdmin` extraídos para `src/lib/authorization.ts`, ao lado de `can`/`hasFeature`/`canActOnResource`.
- ✅ **O helper recebe o ator já buscado**, em vez de buscá-lo: `lib/` não conhece repository, e importar `userRepository` ali inverteria o corte de camadas. Sobra uma linha de `findUserById` em cada guard — o que se repetia de fato (predicado de admin + throw 403) foi eliminado.
- ✅ `assertAdminForBan` (`user.service.ts`), `assertAdminForPermissionFeature` e `assertAdminForRoleAssignment` (`permission.service.ts`) reusam o helper, cada um mantendo seu predicado de "alvo/feature/role privilegiado" e sua mensagem.
- ✅ Refactor comportamento-preservado: a suíte de escalação existente passou **sem uma linha alterada**; só entraram testes unitários do helper (inclusive ator `null` — deletado entre a autenticação e a busca do guard — contando como não-admin).
- ✅ Nota: o helper é pré-requisito da 7.10 (`DELETE /users/:id/lock`), que seria a quarta cópia.

### ✅ [Sessão B] Fase 7.3 — Fundação de observabilidade
> Base compartilhada pelas três categorias de log. Nenhum log novo é emitido aqui — só a infraestrutura que as 7.4/7.5/7.6 usam. Regras completas em `docs/logging-policy.md`.

- ✅ `src/lib/logger.ts`: instância raiz do `pino`, `level` de `LOG_LEVEL` (dev `debug`, prod `info`).
- ✅ **Streams por ambiente** (`pino.multistream`): prod → stdout JSON + buffer; dev → `pino-pretty` + buffer; **test → só o buffer**. É o que permitiu tirar o `silent` do `.env.test`: a suíte segue silenciosa e ainda assim afirma sobre as linhas emitidas, sem mock, pelo mesmo mecanismo que a 7.8 vai expor.
- ✅ `redact` com a lista da política §5.1 (`password`, `currentPassword`, `newPassword`, `passwordHash`, `token`, `accessToken`, `refreshToken`, `req.headers.authorization`, `req.headers.cookie`, `set-cookie`), cada um também na forma `*.campo` — no pino os caminhos são literais, `x` só pega o topo.
- ✅ `src/lib/requestContext.ts`: `AsyncLocalStorage` com `{ requestId, actorId, ip, userAgent, url, method }`; middleware **primeiro de todos** no `app.ts` (para uma request recusada por middleware ainda logar correlacionada), `requestId` = header `x-request-id` do cliente ou `randomUUID()`, ecoado na resposta. `authenticate` chama `setActorId` depois de validar o JWT.
- ✅ `mixin` no logger raiz lendo o `requestId` do store → **toda** linha sai correlacionada.
- ✅ `src/lib/logBuffer.ts`: ring buffer circular de `LOG_BUFFER_SIZE` (default 500) com `push`/`list`/`clear`, truncando entrada acima de `MAX_ENTRY_SIZE` (uma linha gigante não pode comer a memória das outras) e descartando linha malformada em silêncio — o subsistema de log nunca derruba quem loga. Serve de stream do pino guardando o objeto **já parseado**.
- ✅ Testes: cada campo proibido some da linha; `requestId` presente dentro de um store e ausente fora; buffer sobrescreve o mais antigo, respeita o teto e trunca entrada gigante; contextos concorrentes não se misturam.
- ✅ `AsyncLocalStorage` é a **exceção consciente** ao "explicit over implicit" (registrada no `docs/context.md` §2.2 e na política §6); o escopo é estrito: nenhuma regra de negócio lê do store.

### ✅ [Sessão B] Fase 7.4 — Access log HTTP
- ✅ `pino-http` (`src/middlewares/access-log.middleware.ts`) **consumindo a instância de `src/lib/logger.ts`** — herda `redact`, `mixin` e os streams. Uma linha por request: método, rota, status, duração, IP, user-agent, `requestId`, `userId` quando autenticado.
- ✅ `customLogLevel`: 5xx → `error`, 4xx → `warn`, resto → `info`.
- ✅ Rotas de ruído em `debug`: `/api/v1/status` (é o healthcheck do Compose, bate a cada 5s em prod), `/reference`, `/openapi.json`, `/scalar/standalone.js`. Sob `LOG_LEVEL=info` elas somem sem precisar de filtro no agregador — **verificado em produção**.
- ✅ Serializers de `req`/`res` anulados (o par cru traria os headers inteiros); os campos úteis vão por `customProps`. Nada de body, `Authorization`, cookie ou senha — com teste.
- ✅ **Achado da implementação:** a rota tem de vir do `requestContext`, não de `req.url`. O Express **reescreve `req.url`** ao descer nos routers montados, e o access log só é emitido no fim do request — a essa altura `/api/v1/status` já virou `/`, e a regra de rota-de-ruído nunca casava. Pego pelo teste de nível das rotas de ruído.
- ✅ Nota: retenção/agregação fora da app é responsabilidade de infra/deploy (destinos na 7.11).

### ✅ [Sessão B] Fase 7.5 — Application log
> Não é um service novo — é o `pino` da 7.3 usado com convenção. Esta sub-fase **definiu as regras e aplicou nos services que já existem**.

- ✅ Padrão `logger.child({ module })` por módulo: `auth`, `password`, `verification`, `user`, `permission`, `email`, `redis`, `lifecycle`, `http`.
- ✅ Critério de nível da política §3.1 aplicado com a regra anti-inflação ("alguém vai agir ao ver isso?"): login/reset recusados e token rejeitado são `warn` (anomalia esperada e tratada); falha de envio de email é `error` (alguém precisa olhar o relay); erro de conexão do Redis é `error` (enquanto durar, rate limit e lockout ficam fail-open).
- ✅ Aplicado nos services existentes, sem inventar evento novo:
  - ✅ `auth.service` — login ok/falho (com `reason`), refusa por ban/status, rotação de refresh, **reuso de refresh token detectado** (`warn`, dizendo que todas as sessões caíram), logout, revogação de sessão.
  - ✅ `password.service` — reset solicitado/concluído, change concluído, token inválido/usado/expirado (`warn`), conta banida (`warn`), senha atual errada (`warn`).
  - ✅ `verification.service` — envio disparado com `trigger` (`ACCOUNT_CREATION` na criação vs `RESEND` no reenvio, para os dois se distinguirem no log), email verificado, token inválido (`warn`).
  - ✅ `lib/email.ts` — falha de envio em `error` **antes** de virar o 503 (sem a linha, a causa se perdia).
  - ✅ `user.service` — criação, soft delete, ban/unban (o **texto** do motivo do ban não entra na linha).
  - ✅ `permission.service` — grant/revoke de role e de override.
  - ✅ `shutdown.ts` + boot — start, SIGTERM, conexões fechadas (a dep injetada deixou de ser `Console` e virou `{ info, error }`).
- ✅ Nenhum `console.*` restou em `src/`, com a única exceção que a política declara: `config/env.ts`, que reporta env inválida antes do `exit(1)` — ali o logger ainda não pode existir, porque depende do `LOG_LEVEL` que acabou de falhar na validação.
- ✅ `errorHandler` reescrito com **ponto único de saída**: loga uma vez só (5xx `error` com stack, 4xx `warn` sem) e responde. Stack nunca vai no corpo.
- ✅ **`requestId` no corpo do erro** (decisão desta sessão, junto do header `x-request-id`): quem reporta um problema cita o id e o request inteiro é recuperável nos três logs. `errorResponseSchema`/`validationErrorSchema` do OpenAPI acompanham. Aditivo — nenhum teste afirmava shape estrito de corpo de erro.
- ✅ Testes: login errado em `warn` sem a senha; login certo em `info` com `userId`; soft delete em `info`; 404 legítimo **não** gera linha `error`; `requestId` do access log = do application log = do corpo do erro = do header.

### ✅ [Sessão C] Fase 7.6 — Audit log de ações sensíveis
- ✅ Migration `AuditLog` (`actorId?`/`targetId?` = uuid cru **sem FK** — evidência pode apontar para linha soft-deleted, idioma do `User.bannedBy`); índices `(createdAt, id)` (cursor da 7.8), `action`, `actorId`, `targetId`.
- ✅ Taxonomia como **union em tempo de compilação** (`src/lib/auditLog.constants.ts`): as **18** ações da §4.3 declaradas (fecha a taxonomia sem migration por ação nova, idioma de `FeatureName`); `AuditTargetType = User | Route | System`.
- ✅ `src/lib/auditLog.ts` — `record(descriptor, tx?)`: `actorId`/`ip`/`userAgent` do `AsyncLocalStorage` (7.3), `actorId` com override explícito. **Com `tx`** grava na transação da mutação e deixa o erro **propagar** (§4.5); **sem `tx`** grava direto e **engole+loga** a falha (§4.6 — não derruba o request).
- ✅ **Wiring transação × camadas (decisão de abertura):** o **repository é dono da `$transaction`** e o **service passa o descritor** — honra "só o repo toca o Prisma". Cada método de escrita ganhou `audit?: AuditDescriptor`; as transações em forma-array viraram interativas.
- ✅ **Regra de PII** aplicada: `metadata` só ids/enums; `USER_BANNED` grava `reasonProvided` (bool), **não** o texto do motivo — teste de contrato afirma que a linha não vaza motivo nem email do alvo.
- ✅ Append-only: sem update/delete pela aplicação (a retenção é a 7.13).
- ✅ **Escopo (decisão de abertura): 12 dos 18 pontos** — só os com código hoje: `USER_CREATED` (source `SIGNUP`/`ADMIN`), `USER_DELETED`, `USER_BANNED`, `USER_UNBANNED`, `USER_ROLE_GRANTED`/`_REVOKED`, `USER_PERMISSION_GRANTED`/`_REVOKED`, `PASSWORD_RESET_REQUESTED`/`_COMPLETED`, `PASSWORD_CHANGED`, `AUTH_LOGIN_FAILED` (direto; `targetId` do dono quando existe, `reason` `BAD_CREDENTIALS`/`BANNED`). Os 6 restantes (lockout/rate-limit → E; forçar senha/troca de email → H; demo-reset → G) entram nas suas sub-fases, como a §4.3 já atribui.
- ✅ Testes: cada ponto grava exatamente uma linha com `action`/`target`/`actor` certos; **rollback** (força o audit dentro da tx a falhar → nem o ban nem a linha persistem); `metadata` sem PII. Runtime: login falho de email desconhecido → linha com `actor`/`target` nulos, `reason=BAD_CREDENTIALS`, `ip`/`userAgent` preenchidos do store.

### ✅ [Sessão D] Fase 7.7 — Paginação reutilizável (offset + cursor) + filtros em `GET /users`
> Movida para antes dos endpoints de leitura. A Fase 9 (domínio pet shop) depende deste helper. Racional completo no ADR `docs/adr/pagination.md`.

- ✅ `src/lib/pagination.ts` oferecendo **as duas estratégias**; cada recurso escolhe a que fizer sentido.
- ✅ **Offset** (padrão para listas de CRUD): schema Zod `?page=&limit=`, `limit` **default 20 / máximo 100** (constantes no helper, não env var — fazem parte do contrato documentado), envelope `{ data, meta: { page, limit, total } }`.
- ✅ **Cursor/keyset** (para listas append-only ordenadas por tempo): chave composta `(campo_de_ordenação, id)` — **o tiebreaker por `id` é obrigatório**, senão registros com o mesmo timestamp são pulados ou repetidos; envelope `{ data, meta: { nextCursor, hasMore } }`; cursor opaco (base64 do par).
- ✅ `GET /users` migra para offset + filtros `status`, `banned` (via `bannedAt`), `role`.
- ✅ **D4 — envelope em todas as listagens** (breaking change assumido de uma vez): `/roles`, `/features`, `/auth/sessions`, `/users/:userId/roles`, `/users/:userId/features` passam a `{ data, meta }` mesmo sem paginar. **Exceção:** `GET /users/:userId/permissions` continua `string[]` (conjunto de capacidades computado, não coleção de recursos).
  - ✅ Atualizar junto, na mesma feat-branch: presenters, `src/docs/paths/*`, coleção Bruno (`api-collection/`) e os testes de integração de cada rota.
- ✅ Testes: `limit` acima do teto → **422** (não clamp silencioso); página vazia → `data: []` com 200 (lista vazia não é 404); **cursor com timestamps duplicados não pula nem repete** (teste de regressão do tiebreaker, unitário em `pagination.test.ts`); cursor inválido/corrompido → 422.
- ✅ **Implementação:** helper `src/lib/pagination.ts` (`offsetQuerySchema`/`cursorQuerySchema`, `buildOffsetArgs`/`offsetEnvelope`, `encodeCursor`/`decodeCursor`/`buildCursorFilter`/`cursorEnvelope`, `listEnvelope`); docs via `offsetList`/`cursorList`/`staticList` (`components.ts`) + query params por `fromEnvelope`. Suíte **453** + typecheck + lint verdes. Decisões firmadas com o usuário na abertura: filtros de `/users` **estritos** (422) e `read:audit-log:full` **privilegiada** (idioma da não-escalação; aplicada na 7.8).

### ✅ [Sessão D] Fase 7.8 — Endpoints de leitura de log
- ✅ Features novas em `feature.constants.ts` (D5, padrão `ação:recurso:modificador`, **singular** como o resto do catálogo): **`read:log`** (buffer em memória), **`read:audit-log`** (trilha durável, `ip` mascarado) e **`read:audit-log:full`** (destrava o `ip` inteiro).
  - ✅ `role.constants.ts`: admin (via `*`) e manager recebem as três; a role **`demo`** recebe `read:log` e `read:audit-log` — **não** `:full`. Reseed + `db:generate`.
- ✅ **`GET /audit-logs`** (`read:audit-log`): paginação **cursor** (7.7); filtros `action`, `actorId`, `targetType`, `targetId`, `from`, `to`.
  - ✅ `ip` **mascarado** (`192.168.1.***`) para quem não tem `read:audit-log:full` — mesmo endpoint, resposta diferente por permissão (RBAC demonstrado dentro da própria resposta). Mascaramento na camada de serialização; o dado permanece íntegro no banco.
  - ✅ Só `GET`. Teste explícito de que `PATCH`/`DELETE` não existem (imutabilidade intencional).
- ✅ **`GET /logs/recent`** (`read:log`): ring buffer da 7.3, `?limit=` opcional, sem paginação (já é limitado por construção), mas **com o envelope** `{ data, meta }` (D4).
  - ✅ `meta` explicitando a limitação: o buffer é **por processo** e **some no restart**.
- ✅ Testes: 401 sem token; 403 sem a feature; demo/ator lê os dois com 200; **reader sem `:full` recebe `ip` mascarado e ator com `:full` recebe inteiro** (mesma linha, duas respostas); filtros combinados (`action`/`targetType`/`actorId`/`from`-`to`); **cursor percorre 5 linhas de timestamp igual sem pular/repetir**; cursor corrompido → 422; `limit` > 100 → 422; `PATCH`/`DELETE /audit-logs` → 404.
- ✅ **Escalação (decisão firmada com o usuário): `read:audit-log:full` é privilegiada.** `PRIVILEGED_FEATURES = [...PERMISSION_FEATURES, "read:audit-log:full"]` (`role.constants.ts`); os dois guards de `permission.service.ts` passaram a consultá-lo (mensagem generalizada p/ "features privilegiadas"). `read:log`/`read:audit-log` são normais. Novos módulos `src/modules/audit-log/` e `src/modules/log/` (template do módulo read-only `feature`); `maskIp` na serialização; `/logs/recent` sem view (entradas já redigidas pelo `redact`). Docs (`paths/audit-log.ts`, `paths/log.ts`, tags Audit/Logs) + Bruno (`audit-logs/`, `logs/`). Suíte **471** + typecheck + lint verdes.
  - ✅ **Docs atualizados junto** (não deferidos): `CLAUDE.md` (regra de não-escalação agora descreve `PRIVILEGED_FEATURES`, incluindo `read:audit-log:full`), `docs/endpoints.md` (rotas `/audit-logs` e `/logs/recent` + nota do envelope) e `docs/logging-policy.md` §8 (concessão de `:full` é privilegiada).

### ✅ [Sessão E] Fase 7.9 — Rate limiting nas rotas de auth
> Valores e racional firmados no ADR `docs/adr/rate-limiting-and-lockout.md`.

- ✅ `rate-limiter-flexible` com `RateLimiterRedis` (`src/lib/rateLimit.ts`).
- ✅ Regras **por IP**: `login`, `signup`, `forgot-password`+`verify-email/resend` (um contador só, compartilhado pelas duas rotas — mesma linha do ADR).
- ✅ Regra **por email destinatário** (`forgot-password`+`verify-email/resend`, mesmo par de rotas, chave = email em vez de IP) — fecha o furo do atacante que rotaciona IP para bombardear a caixa de uma vítima específica.
- ✅ **Fail-open (D2):** rejeição do `consume()` que não é `RateLimiterRes` (falha de conexão) → `log.error` + o request segue. Coberto por teste unitário (`tests/unit/lib/rateLimit.test.ts`, limitador fake rejeitando com erro genérico) em vez de derrubar o Redis de verdade em teste de integração.
- ✅ Resposta 429 genérica (`TooManyRequestsError`, mesmo molde do `PayloadTooLargeError` da 7.0) — não revela qual regra disparou nem confirma existência de conta. `Retry-After` no header (`msBeforeNext` do limitador).
- ✅ Excedido → `AUTH_RATE_LIMIT_EXCEEDED` no audit log (`targetType: "Route"`, `metadata: { rule, scope }`) + `warn` no application log.
- ✅ Testes com o Redis real do ambiente de teste (serviço no override de test, 7.0); contador isolado por teste — `flushRedis()` (`tests/helpers/redis.ts`) no `afterEach` de cada arquivo de teste de integração que autentica. **Decisão de execução:** não é um `setupFile` global — um `afterEach` global corria na frente da conexão real do ioredis terminar o handshake nos testes unitários (rápidos, ms), derrubando-os com "enableOfflineQueue"; escopado por arquivo, no mesmo idioma explícito do `clearDatabase()`.
- ✅ **Decisão de execução (env vars, D8):** duas vars por regra (`RATE_LIMIT_<REGRA>_MAX` + `_WINDOW_MS`) em vez de uma string composta — mesmo idioma do `LOCKOUT_*` da 7.10, sem parser novo no projeto. Confirmado com o usuário na abertura da sessão (o ADR listava um nome só por regra, mas D8 exige a janela configurável também).
- ✅ Suíte (485) + `typecheck` + `lint` verdes.

### ✅ [Sessão E] Fase 7.10 — Account lockout + desbloqueio pelo admin
- ✅ Contador de falhas por conta em Redis (D8, por env var): **`LOCKOUT_THRESHOLD` 5 falhas → `LOCKOUT_WINDOW_MS` 15min**, dobrando a cada ciclo seguinte até o teto `LOCKOUT_MAX_MS` (24h). Estado (`failures`/`backoffLevel`/`lockedUntil`) num hash Redis (`lockout:{userId}`), sem coluna nova no `User`. Transição de estado extraída como função **pura** (`applyFailure`, `src/lib/lockout.ts`) — mesmo idioma de `computeEffectiveFeatures` — testada por unidade sem tocar Redis; a leitura/escrita fica em wrappers finos ao redor.
- ✅ Reset completo (contador + nível de backoff) no login certo (`clearLockout(..., "SUCCESSFUL_LOGIN")`) — no-op (sem escrita, sem audit) se a conta nunca falhou.
- ✅ Checagem entra em `auth.service.login`, **no ramo de senha correta** (não antes de verificar a senha): quem erra a senha continua recebendo 401 igual a hoje, sem pista sobre o estado da conta — o rate limit por IP/email (7.9) já cobre o volume de tentativas; o papel do lockout é impedir que uma senha eventualmente certa complete o login dentro da janela. **Fail-open (D2)** também aqui — falha do Redis loga `error` e a conta segue destravada.
- ✅ **`DELETE /users/:id/lock`** (`manage:user:status`; guarda de privilegiado reusando o helper da 7.2, generalizado de `assertAdminForBan` para `assertAdminForPrivilegedTarget` — agora serve ban/unban **e** lock/unlock) — desbloqueia, reset completo, 204 sucesso, 409 auto-unlock, 409 se não estava travada; registra `AUTH_LOCKOUT_CLEARED` (`clearedBy: "ADMIN"`).
- ✅ Lockout disparado → `AUTH_LOCKOUT_TRIGGERED` no audit log; tentativa (mesmo com senha certa) durante o travamento → `AUTH_LOGIN_FAILED` com `reason: "LOCKED"` + **429** (mesma resposta genérica do rate limit, D2/ADR).
- ✅ Sem lock manual pelo admin nesta fase (só o desbloqueio) — fora de escopo, registrado no `docs/backlog.md`.
- ✅ Suíte (516) + `typecheck` + `lint` verdes.

### ✅ [Sessão F] Fase 7.11 — Destinos externos: Axiom + Sentry
- ✅ **Axiom** como transport do pino (`@axiomhq/pino`), em **worker thread** (`pino.transport`) — chamada remota nunca no caminho síncrono do request. Decisão pura de ativação extraída (`resolveAxiomConfig`, `logger.ts`) — testável sem tocar `pino.transport` nem a rede.
- ✅ `flushLogger()` (`logger.ts`) dá `.flush()` no `ThreadStream` do Axiom antes do SIGTERM — `pino.multistream()` não expõe um flush agregado (verificado em `node_modules/pino`), por isso a referência ao stream é guardada em escopo de módulo. Chamado pelo `shutdown.ts` nos caminhos de sucesso/erro normais, **não** no timeout forçado (defeitaria o propósito do timeout).
- ✅ Só ativa com `AXIOM_TOKEN`/`AXIOM_DATASET` presentes; ausente → degrada para stdout, **nunca** derruba o boot — confirmado com boot real do container `runtime` (ver checkpoint abaixo).
- ✅ **Sentry** (`src/lib/sentry.ts`) capturando apenas falha de verdade: `Sentry.captureException` no branch `statusCode >= 500` já existente de `error-handler.middleware.ts` (`respond()`), cobrindo `AppError` ≥500 e o catch-all `InternalServerError`; **não** `Sentry.setupExpressErrorHandler` (o projeto já tem seu próprio ponto único de saída de erro). `unhandledRejection`/`uncaughtException` capturados em `server.ts` e reaproveitam o `shutdown.ts` existente em vez de um caminho de saída novo.
- ✅ `sendDefaultPii: false` + `beforeSend: scrubEvent` — função pura que censura os mesmos campos/headers proibidos do pino, reaproveitando `FORBIDDEN_FIELD_NAMES`/`FORBIDDEN_HEADER_NAMES` exportados de `logger.ts` (fonte única, sem cópia divergente).
- ✅ `environment: env.NODE_ENV` + `release` lido do `package.json` via `process.cwd()` (não caminho relativo ao módulo — o tsup achata `src/lib/sentry.ts` num `dist/server.js` só, e `process.cwd()` é o único ponto estável entre dev/test/prod). Sem git SHA/CI nesta fase — registrado como possível refinamento futuro, não backlog bloqueante.
- ✅ Env vars novas: `AXIOM_TOKEN`, `AXIOM_DATASET`, `SENTRY_DSN` — todas opcionais.
- ✅ **Checkpoint:** build do stage `runtime` + boot real com `AXIOM_TOKEN`/`AXIOM_DATASET`/`SENTRY_DSN` fake — o worker thread do Axiom resolve e roda a partir do bundle (chegou a tentar ingest de verdade e recebeu `403 forbidden` do token fake, não um crash de resolução); boot **sem** as três vars segue normal (`GET /status` → 200); SIGTERM gracioso nos dois casos. Suíte (537) + `typecheck` + `lint` verdes.
- 🔸 **Pendente para o usuário:** criar as contas reais (Axiom + Sentry) e confirmar visualmente que uma linha de log e um erro 5xx chegam nos dashboards — roteiro em `docs/fase-7-f-external-setup.md` (temporário, não commitado, apagar depois de usar).

### ✅ [Sessão F] Fase 7.12 — Timeouts em tudo
> Sem timeout, uma dependência pendurada exaure o pool e derruba a app inteira — o modo de falha mais comum em prod e o menos exercitado em teste.

- ✅ HTTP server: `server.headersTimeout`/`requestTimeout`/`keepAliveTimeout` setados logo após `app.listen()` (não dentro do callback, pra fechar a janela de corrida antes da primeira conexão). Verificado com boot real (local via `tsx` e Docker `runtime`): Node valida `requestTimeout > headersTimeout` na hora de setar — se os defaults estivessem invertidos o boot já teria explodido.
- ✅ Prisma (`src/lib/prisma.ts`): `transactionOptions` (`maxWait`/`timeout`) no `PrismaClient`, aplicado a toda `$transaction()` sem mudar nenhum call-site de repository. **Correção em relação ao texto original** ("timeout de pool na connection string"): o projeto usa `@prisma/adapter-pg`, não o pool nativo do Prisma — os parâmetros clássicos de URL não são lidos por esse caminho; o timeout de aquisição de conexão é `connectionTimeoutMillis`, campo irmão de `connectionString` no `pg.PoolConfig` passado ao `PrismaPg`. Mesmo objetivo, forma de configurar diferente — detalhada em `docs/context.md`.
- ✅ Redis (`src/lib/redis.ts`): `connectTimeout` + `commandTimeout` — sem eles o **fail-open (D2)** é ilusório, porque um Redis que aceita a conexão mas não responde penduraria o login pelo timeout de socket do SO. TODO antigo (mal rotulado 7.13) removido.
- ✅ **SMTP (nodemailer, `src/lib/email.ts`)**: `connectionTimeout`, `greetingTimeout` e `socketTimeout` no transporter — o envio é SMTP, não a API HTTP da Resend, então `AbortSignal.timeout` não se aplica. Falha/timeout continua virando `error` no application log (7.5) — e agora, com a 7.11 já mergeada, também chega ao Sentry pelo branch `statusCode >= 500` do error handler.
- ✅ Valores por env com defaults conservadores, registrados em `docs/context.md` (§2.2 "Observabilidade"): `SERVER_HEADERS_TIMEOUT_MS=65000`/`SERVER_REQUEST_TIMEOUT_MS=70000`/`SERVER_KEEP_ALIVE_TIMEOUT_MS=61000`, `PRISMA_TX_MAX_WAIT_MS=5000`/`PRISMA_TX_TIMEOUT_MS=8000`, `DB_POOL_CONNECT_TIMEOUT_MS=5000`, `REDIS_CONNECT_TIMEOUT_MS=2000`/`REDIS_COMMAND_TIMEOUT_MS=2000`, `SMTP_CONNECTION_TIMEOUT_MS=10000`/`SMTP_GREETING_TIMEOUT_MS=5000`/`SMTP_SOCKET_TIMEOUT_MS=20000`.
- ✅ Testes por asserção de argumentos de construtor/opções (mesmo padrão de `redis.test.ts`: mock do módulo, assert nas opções passadas), sem esperar timeouts reais — cobre Redis, Prisma (`PrismaPg`/`PrismaClient` mockados) e SMTP (`nodemailer.createTransport` mockado). HTTP server verificado por boot real (local + Docker), sem teste unitário dedicado (não há precedente de testar `server.ts` isoladamente no projeto). Suíte (541) + `typecheck` + `lint` verdes.

### ✅ [Sessão G] Fase 7.13 — Teto de sessões vivas + faxina de registros mortos
- ✅ Teto de sessões vivas simultâneas por usuário: **`MAX_LIVE_SESSIONS` 5** (D8, env var); evict da mais antiga ao exceder (login nunca é recusado) — `authRepository.createSessionAndEvictOldest` (transação interativa, mesmo padrão de `rotateSession`), chamada por `auth.service.login()`. Log de aplicação em `info` quando evicta; sem ação de audit nova (higiene, não evento de segurança).
- ✅ `src/scripts/cleanup-sessions.ts`: hard delete de `Session`/`VerificationToken` mortos há mais de `SESSION_RETENTION_DAYS` (default 30). **Critério de "morto" firmado com o usuário:** conta a partir de **qualquer** timestamp de morte (`expiresAt` vencido, OU `usedAt`, OU `invalidatedAt` — checados independentemente via `OR`), não só do `expiresAt` natural — uma sessão invalidada/usada há muito tempo já é lixo mesmo com `expiresAt` ainda no futuro.
- ✅ `src/scripts/cleanup-audit-log.ts`: hard delete de `AuditLog` acima de `AUDIT_LOG_RETENTION_DAYS` (default 365, produção; demo sobrescreve para 21 no próprio `.env.production`) — **único** lugar autorizado a deletar audit log.
- ✅ Ambos com `--dry-run` (`count()` em vez de `deleteMany()`, mesmo `where`), execução em transação, resultado (linhas por tabela + duração) no application log (`logger.child({ module: ... })`).
- ✅ Bundlados pelo tsup (`dist/cleanup-sessions.js`/`dist/cleanup-audit-log.js`), `npm run db:cleanup-sessions`/`db:cleanup-audit-log` (dev), agendados via **systemd timer diário** (`infra/cron/`, 04:10/04:20 UTC) — nunca dentro do ciclo request/response.
- ✅ Testes de integração (`tests/integration/scripts/`) contra o Postgres de teste real; teto de sessões testado em `auth.test.ts` (login nunca recusado, sessão mais antiga invalidada, refresh com token evictado → 401). Suíte (556) + `typecheck` + `lint` verdes.

### ✅ [Sessão G] Fase 7.14 — Reset do ambiente demo
> Higiene do deploy de portfólio. **Não** é o que garante o demo read-only — isso é RBAC (role `demo`, Fase 5). São duas defesas independentes: a autorização impede a escrita do usuário demo, a faxina limpa o que os outros usuários criaram.

- ✅ `src/scripts/demo-reset.ts`: **truncate + reseed** (determinístico e não cresce a cada model novo da Fase 9). Trunca as mesmas 8 tabelas transacionais e na mesma ordem FK-safe de `tests/helpers/database.ts` (`clearDatabase`), preservando `Role`/`Feature`/`RoleFeature` (referência, recriada pelo reseed).
- ✅ Seed extraído para `src/lib/seedDatabase.ts` (`runSeed`, sem nenhuma auto-execução de nível de módulo) e reaproveitado por `prisma/seed.ts` (CLI) e por `demo-reset.ts`. **Achado na implementação:** importar `runSeed` diretamente de `prisma/seed.ts` (que tinha `main()` guardado por `import.meta.url === argv[1]`) colidia depois que o tsup bundlava os dois scripts juntos — o bundle vira um módulo só, então os dois guards comparavam contra o **mesmo** `import.meta.url`/`argv[1]` e ambos disparavam, fazendo `demo-reset.js` também rodar (e desconectar) o `main()` do seed por baixo. Resolvido extraindo a lógica reaproveitável para um módulo sem nenhum código auto-executável.
- ✅ **Guarda:** só executa com `DEMO_MODE=true` explícito (`assertDemoModeEnabled`, função pura testada isoladamente). **Não** infere de `NODE_ENV` — o deploy demo *é* production. Sem a flag: erro barulhento, exit ≠ 0, nada apagado. Guarda aplicada tanto ao dry-run quanto à execução real (mesmo mental model nos dois modos).
- ✅ `--dry-run` (contagens via `count()`, reseed também não roda — usa o tamanho estático dos catálogos como prévia); execução real em transação.
- ✅ Resultado no application log + `DEMO_RESET_EXECUTED` no audit log (`targetType: "System"`, `actorId: null`, contagem por tabela + duração) — só na execução real, nunca no dry-run.
- ✅ Agendamento **diário** via **systemd timer** versionado em `infra/cron/` (04:00 UTC, `infra/cron/README.md` com o passo de instalação) — preferido a cron por dar `journalctl`, `Persistent=` e proteção contra sobreposição.
  - ✅ Corte de responsabilidade: **`src/scripts/`** = código (importa Prisma/`env`/`logger`, é bundlado pelo tsup); **`infra/`** = agendamento e como o container roda.
- ✅ Horário publicado no `README.md` ("ambiente demo resetado diariamente às 04:00 UTC") — transforma o logout inesperado em comportamento documentado.
- ✅ Testes de integração (`tests/integration/scripts/demo-reset.test.ts`): guarda pura, truncate+reseed com `Role`/`Feature` preservadas, dry-run não escreve nada, audit só na execução real. Suíte (561) + `typecheck` + `lint` verdes.
- 🔸 Quando existir dummy data (Fase 9+), o reseed passa a restaurá-lo.

### ✅ [Sessão H] Fase 7.15 — Troca de email
> Desenho firmado com o usuário em 2026-08-03, antes da implementação.

- ✅ **Migration** (`add_email_change_and_previous_emails`): `VerificationPurpose` ganhou `EMAIL_CHANGE`. `VerificationToken` ganhou coluna `newEmail String?` (só usada nesse purpose — o token carrega o próprio alvo, não depende de reler `User.pendingEmail` no confirm). `User` ganhou `pendingEmail String? @map("pending_email")`, **não-único**. Tabela nova `PreviousEmail` (`id`, `userId` FK, `email` **unique global**, `replacedAt`, `createdAt`, índice em `userId`).
- ✅ **`POST /auth/change-email`** (`authenticate` + `canAccess("update:user")`, sem feature nova): body `{ currentPassword, newEmail }`. Reabre a decisão de `user.schema.ts:56` (`email: z.never(...)` no `PATCH /users/:id`) — a troca é endpoint próprio, fora do update genérico. Exige a senha atual, recusa se `newEmail` for igual ao ativo, checa conflito contra `User.email` **e** `PreviousEmail` → 409 revelando o conflito. Gera token opaco (`purpose: EMAIL_CHANGE`, TTL = `EMAIL_VERIFICATION_TTL_MS` reaproveitada), grava `newEmail` na própria linha do token e seta `pendingEmail`. Uma nova chamada invalida o token `EMAIL_CHANGE` pendente anterior e sobrescreve `pendingEmail` (mesmo idioma de "unicidade do ativo por código" de `UserFeature`/`UserRole`) — dobra como cancelamento implícito. Dispara, na mesma operação, o aviso de segurança para o email **antigo** (com o link de confirmação — é quem ainda tem acesso à caixa real). Sem rate limit dedicado.
- ✅ **`POST /auth/confirm-email-change`** (público): body `{ token }`. Em transação: `User.email = token.newEmail`, `pendingEmail = null`, insere `PreviousEmail`, marca o token usado, audit `EMAIL_CHANGE_COMPLETED`. Sem pré-checagem de conflito de última hora — o próprio `user.update` estoura P2002 → 409 pelo handler já existente.
- ✅ **Email trocado fica reservado para sempre** (`PreviousEmail`, unique global) — mesmo idioma do email "preso" de conta deletada (nota da Fase 8). `createCustomer`/`createEmployee` (`user.service.ts`) ganharam `assertEmailAvailable`, checando `PreviousEmail` além do unique de `User.email` — senão a reserva seria furável simplesmente criando conta nova.
- ✅ `GET /me` e a view `owner`/`admin` de `GET /users/:id` passam a expor `pendingEmail`.
- ✅ `EMAIL_CHANGE_REQUESTED` (no pedido) / `EMAIL_CHANGE_COMPLETED` (na confirmação) no audit log — só ids/enum, email nunca em `metadata`.
- ✅ **Implementação:** terceiro service do módulo auth, `src/modules/auth/emailChange.service.ts` (ao lado de `password.service.ts`/`verification.service.ts`); `authRepository.requestEmailChange`/`consumeEmailChange` (transação interativa, mesmo idioma de `consumePasswordReset`); `userRepository.findPreviousEmailByEmail`. `clearDatabase()` e o guard de regressão (`clearDatabase.guard.test.ts`) atualizados para a tabela nova. Suíte (584) + `typecheck` + `lint` verdes.
- ✅ **Achado à parte, corrigido junto:** o script `db:generate` (`package.json`) estava quebrado quando rodado isolado — faltava o prefixo `dotenv -e .env.development` que os demais scripts de banco já usam (sem ele, o `prisma.config.ts` não resolvia `DATABASE_URL`). Ajustado para o mesmo padrão de `db:migrate`/`db:deploy`.

### ✅ [Sessão H] Fase 7.16 — Forçar troca de senha, ação do admin
> Desenho firmado com o usuário em 2026-08-03, antes da implementação.

- ✅ **Migration** (`add_must_change_password`): `User` ganhou `mustChangePassword Boolean @default(false) @map("must_change_password")`.
- ✅ **`POST /users/:id/force-password-reset`** (mesma convenção de verbo de `/ban`): `canAccess("manage:user:status")` (reaproveita a feature de ban/lock, sem feature nova) + `assertAdminForPrivilegedTarget` (mesmo guard de não-escalação do ban/lock) + recusa auto-alvo (409, mesmo idioma do self-ban). **409** se `mustChangePassword` já estiver ativo.
  - Em transação (`user.repository.forcePasswordResetAndInvalidateSessions`, mesmo wiring da 7.6): seta `mustChangePassword = true`, invalida todas as sessões vivas do alvo, cria `VerificationToken` (`purpose: PASSWORD_RESET`, mesmo `PASSWORD_RESET_TTL_MS`), audit `PASSWORD_CHANGE_FORCED`.
  - Fora da transação: envia o mesmo email de `forgot-password` (`buildPasswordResetEmail`, exportado de `password.service.ts` e reaproveitado em `user.service.ts`) para o alvo.
  - Resposta **204** (mesmo padrão de ban/unban/lock).
- ✅ **Login totalmente bloqueado enquanto `mustChangePassword=true`**: checagem em `auth.service.login`, no ramo de senha correta, **depois do `bannedAt` e antes do `status !== ACTIVE`** — coberto por teste de regressão de ordem (banido + `mustChangePassword` juntos → mensagem de banido vence). Mensagem própria (403): "Você precisa definir uma nova senha" / "Verifique seu email para o link de redefinição de senha".
- ✅ `consumePasswordReset` (`auth.repository.ts`, usado por `resetPassword`) passa a também **limpar `mustChangePassword`** ao trocar a senha — mesmo endpoint/fluxo de `forgot-password` de ponta a ponta, só a origem do token muda (admin vs. o próprio usuário). Nenhum endpoint novo de confirmação.
- ✅ `PASSWORD_CHANGE_FORCED` no audit log — `actorId` = admin, `targetId` = alvo, sem PII.
- ✅ **Implementação:** testes de regressão cobrindo o fluxo ponta-a-ponta (força → captura o token do email → `reset-password` → login com a senha nova) e o `forgot-password` de sempre continuando intacto (`consumePasswordReset` agora é compartilhada pelas duas origens). Suíte (596) + `typecheck` + `lint` verdes.

### ✅ [Sessão H] Fase 7.17 — Polir `GET /auth/sessions`
- ✅ Parsing de user-agent via `ua-parser-js` (`src/lib/userAgent.ts`, `describeUserAgent` — função pura, testada por unidade) → `device: "Chrome no Windows"` (fallback `"Dispositivo desconhecido"` quando o UA falta ou não é reconhecido). A view (`sessionViews.default`) troca o `userAgent` cru por `device` já formatado e ganha `current: boolean`.
- ✅ `current` é calculado comparando o hash do refresh token do cookie da própria request (`req.cookies[REFRESH_TOKEN_COOKIE_NAME]`, lido no controller e passado ao `authService.listSessions`) contra `refreshTokenHash` de cada sessão — sem cookie (ex. acesso só com o access token), nenhuma sessão é marcada como atual.
- ✅ Suíte (604) + `typecheck` + `lint` verdes.

### ✅ Fase 7.18 — Refresh token hasheado em repouso *(D1 — já implementado desde a Fase 3)*
> Item levantado na reformulação e resolvido na análise do planejamento, **sem código novo**: `Session.refreshTokenHash` já guarda `sha256(token)` (`src/lib/token.ts`, `hashToken`) desde a Fase 3 — o token opaco nunca foi persistido em plaintext. A comparação em tempo constante que o item pedia não se aplica: o lookup é `findUnique` pelo hash, não comparação byte a byte de segredo. Trocar sha256 por HMAC com `PEPPER` foi considerado e **recusado** (ganho marginal com token de 32 bytes de entropia; custo = migration invalidando todas as sessões) — registrado no `docs/backlog.md`.
>
> Resta apenas formalizar em teste de regressão, na **Sessão I** (7.19): a coluna nunca contém o token entregue ao cliente; token adulterado → 401.

### ✅ [Sessão I] Fase 7.19 — Fechos
- ✅ **Teste de regressão do refresh hash (D1 / 7.18):** 2 casos novos em `auth.test.ts` (`describe("POST /api/v1/auth/refresh")`) — `refreshTokenHash` nunca é igual ao token cru (e é igual a `hashToken(token)`); token adulterado por 1 caractere → 401.
- ✅ `docs/endpoints.md` atualizado com as 4 rotas que faltavam (`DELETE /users/:id/lock`, `POST /users/:id/force-password-reset`, `POST /auth/change-email`, `POST /auth/confirm-email-change`) — o resto (`/audit-logs`, `/logs/recent`, envelope `{data,meta}`) já estava documentado desde a 7.7/7.8.
- ✅ `docs/logging-policy.md`: cabeçalho de status atualizado para refletir todas as sub-fases que de fato contribuíram (7.3–7.6, 7.9–7.11, 7.14–7.16); valores de retenção/buffer conferidos contra `env.ts`, sem divergência.
- ✅ `docs/context.md`: §2.2 promovida de "planejada" a "implementada"; acrescentado o fecho do D1 (teste de regressão) e um parágrafo "Fase 7 (fechada)" em §4 resumindo as 9 sessões.
- ✅ ADRs `rate-limiting-and-lockout.md` e `pagination.md`: seção "Quando revisitar" ganhou "O que a Fase 7 mostrou até aqui" — nenhum dos gatilhos previstos ocorreu de fato ainda (fail-open só exercitado artificialmente, nenhum recurso novo usou o helper de paginação).
- ✅ `docs/backlog.md` revisado: nenhum item resolvido pela fase, nenhuma entrada nova — arquivo já preciso.
- ✅ `README.md`: Redis mencionado em "Rodar localmente"; roadmap promove a Fase 7 a ✅ (saindo de "A seguir"); contagem de testes atualizada (341 → 606, badge + texto).
- ✅ `npm run typecheck` + `npm run lint` + suíte completa (606 testes) verdes; Fase 7 marcada ✅.

---

## Fases seguintes (resumo)
- **Fase 8 — Reativação de conta deletada (soft delete):** serviço para reativar contas que tenham sido deletada. Hoje quando acontece um delete de uma conta, a conta entra no soft delete o que prende o email e os dados que são unicos na tabela. Essa fase tem como objetivo permitir que usuarios que tenham deletado a sua conta recuperem a conta e atualizem para novos dados (usuario pode ter mudado email e etc) - um ponto de atenção é não recuperar perfis errados, ex: um usuario que era employee e customer, deixou de ser employee e teve a conta deletada, mas quer "criar" uma conta de customer (signup), teria o cpf preso na conta antigo, ele deve ser capaz de recuperar a conta, mas apenas customer - sem o perfil de employee que deve permanecer soft delete. A feature de troca de email criou uma tabela de emails antigos de um usuario - hoje, um email antigo de usuario, deixa o email trabalho que nem o soft delete de um usuario faz. A partir desse momento, emails antigos não devem deixar o email preso e ele deve ser capaz de criar uma conta nova no app.
- **Fase 9 — Domínio pet shop:** model Pet (Customer 1:N), CRUD aninhado em customers, scopes own/others, views owner/staff.

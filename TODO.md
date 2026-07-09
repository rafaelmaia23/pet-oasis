# pet-oasis — TODO (Ciclo 1)

> Estado e ordem das tarefas. Consulte antes de começar; atualize ao concluir.
> Detalhes de decisões em `CONTEXT.md`. Regras de negócio firmadas no `CLAUDE.md`.

## Legenda
✅ feito · 🔄 em andamento · ⬜ a fazer · 🔸 polimento (não bloqueia)

---

## Fase 2 — Autorização e perfis ✅
> RBAC + CRUD de user com modelo de perfis. Regras e racional no `CONTEXT.md` (§1, §2).
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
> Migrou de "JWT-como-Session validado no banco a cada request" para "access JWT 15min validado local + refresh opaco rotativo". Design e racional no `CONTEXT.md` (§2, §3).
- `Session` reshaped: `refreshTokenHash`/`usedAt`/`userAgent`/`ipAddress` (sem `token`). `src/lib/token.ts` (gera/hash opaco).
- `authenticate` reescrito (valida JWT só localmente, sem hit no banco), movido de global → por-grupo-de-rota; erros via `create*Error` (idem `canAccess`).
- Endpoints: `POST /auth/login` (sempre cria Session nova), `POST /auth/refresh` (rotação + detecção de roubo por reuso → invalida todas as sessões), `POST /auth/logout` (por refresh cookie + ownership), `GET /auth/sessions` (só vivas), `DELETE /auth/sessions/:id` (404 unificado "não existe/morta").
- Features `read:session`/`manage:session` (substituem `logout:session`).
- Distinção de critério `invalidateAllUserSessions` (resposta a roubo, mantém `usedAt`) vs `softDeleteUserAndInvalidateSessions` (encerra conta, filtra `usedAt`).

---

## Fase 4 — Email, status de conta e banimento ✅

> Introduz status de conta com verificação de email obrigatória, um serviço de email genérico (nodemailer; mailpit em dev / Resend em prod), troca/recuperação de senha e banimento. Regras de negócio decididas no planejamento e registradas no `CONTEXT.md` (seção "Fase 4"). Cada seção abaixo é uma feat-branch em TDD (teste primeiro, código depois).
>
> **Modelo de status (firmado):** `enum UserStatus { PENDING, ACTIVE }` + coluna `status` (default `PENDING`). Ban é **ortogonal**: colunas `bannedAt`/`bannedBy`/`banReason` no `User` (idioma timestamp-flag, como `deletedAt`). Loga só se `status == ACTIVE` **e** `bannedAt == null`. Desbanir limpa as três colunas e preserva o `status`.

### ✅ Fase 4.0 — Fundação (schema, config, docker, libs)
- ✅ Migration: `enum UserStatus { PENDING, ACTIVE }`; `users.status` (default `PENDING`); `users.bannedAt`/`bannedBy`/`banReason` (nullable, `bannedBy` = uuid cru sem FK); model `VerificationToken` (`id`, `userId`, `tokenHash @unique`, `purpose`, `expiresAt`, `usedAt?`, `createdAt`, `onDelete: Cascade`) + `enum VerificationPurpose { EMAIL_VERIFICATION, PASSWORD_RESET }`. Aplicada em dev + teste; backfill `UPDATE users SET status='ACTIVE'` para linhas pré-existentes (default seguro).
- ✅ `src/config/env.ts` + `env.example`: `SMTP_HOST`, `SMTP_PORT` (`z.coerce.number()`), `SMTP_USER`/`SMTP_PASS` (opcionais — mailpit sem auth), `MAIL_FROM`, `APP_URL`. Defaults dev-friendly (mailpit `localhost:1025`) → boota sem config; prod sobrescreve. Espelhado em `env.example` (grupo `# Mail`).
- ✅ `docker-compose.yml`: serviço `mailpit` (`axllent/mailpit`, SMTP `1025`, UI `8025`, sem volume) + npm script `mail:up` (padrão dos `db:*`). `nodemailer` + `@types/nodemailer` instalados. **Rename:** `db:up`/`db:down`/`db:reset` (rodam `docker compose` sem serviço → sobem/derrubam tudo) → `services:up`/`services:down`/`services:reset`; refs atualizadas no `CLAUDE.md`.
- ✅ `src/lib/token.ts`: generalizado `generateOpaqueRefreshToken`/`hashRefreshToken` → `generateOpaqueToken`/`hashToken` (+ const `OPAQUE_TOKEN_BYTES`); implementação inalterada (sha256/hex, 32 bytes). Callers adaptados (`auth.service.ts`, `auth.test.ts` integração). Testes unitários primeiro (`token.test.ts`); suíte de auth verde.
- ✅ `src/lib/email.ts`: serviço genérico — `transporter` singleton via `env` (`secure` = produção; `auth` só se `SMTP_USER`), `send({ to, subject, html, text? })` com `from: MAIL_FROM`, erro → `createServiceUnavailableError` (503, message/action PT, `cause` preservado). Teste unitário com nodemailer mockado (`vi.hoisted` + factory `vi.mock` — primeiro mock de módulo default-export no repo).
- ✅ `feature.constants.ts`: adicionado `manage:user:status`. `role.constants.ts`: incluído em `USER_ADMINISTRATION_FEATURES` (manager ganha; admin via `*`). `npm run db:seed` (17 features) + client regenerado (`db:generate`); catálogo sincronizado (test DB reseeda no globalSetup do Vitest).
- ✅ `src/__tests__/helpers/database.ts` (`clearDatabase`): deleta `verificationToken` antes de `user`. Factories (`buildCustomer`/`buildEmployee`): override `status?` com default `ACTIVE` (PENDING sob demanda p/ testes da 4.1); repository de signup inalterado (segue `PENDING`).
- ✅ `npm run typecheck` + `npm run lint` limpos (suíte 273/273 verde).

### ✅ Fase 4.1 — Verificação de email + gate de login
> **Firmado:** todo usuário novo (signup self-service **e** criados por admin via `POST /users`) nasce `PENDING`. Verificação sob `/auth` (recurso central = token). Só `ACTIVE` loga.
>
> **Decisões desta fase:** emissão vale só para a **criação de usuário** (`createCustomer`/`createEmployee`, que cobre signup **e** `POST /users`); os **POSTs de perfil NÃO emitem** (adicionam perfil a user já existente, que já tem status/token). Token inválido/expirado/usado no verify-email → **400 genérico** (reusado no reset da 4.2). Sucesso do verify-email → **204**. Para evitar import circular (`auth.service`↔`user.service`), a orquestração vive em `src/modules/auth/verification.service.ts`.

- ✅ Criação de usuário: `status` fica `PENDING` (default do schema), emite `VerificationToken(EMAIL_VERIFICATION)` (opaco, hash salvo, TTL **24h**) e envia email com link do front (`APP_URL`) + token. Vale só pra `createCustomer`/`createEmployee` (service). `EMAIL_VERIFICATION_TTL_MS` em `auth.constants.ts`.
  - ✅ Testes: signup e `POST /users` deixam o user `PENDING`; um `VerificationToken` é criado; o email é disparado (`@/lib/email` mockado).
- ✅ **POST /api/v1/auth/verify-email** `{ token }` (público)
  - ✅ Testes: 422 body inválido; token inexistente/expirado/já usado → **400** genérico; sucesso → **204**, `status = ACTIVE`, token marca `usedAt`; verificar duas vezes o mesmo token → 2ª falha 400
  - ✅ Schema `verifyEmailSchema`; `verification.service.verifyEmail` (busca por hash → valida `purpose`/`expiresAt`/`usedAt` → `authRepository.consumeEmailVerification` `$transaction`: consome token + ativa user); repository (`findVerificationTokenByHash`, `createVerificationToken`, `consumeEmailVerification`); controller + rota
- ✅ **POST /api/v1/auth/verify-email/resend** `{ email }` (público)
  - ✅ Testes: **sempre 200 genérico** (email inexistente/já ACTIVE/banido respondem igual, nenhum email sai); se `PENDING` e não banido, token novo + email
  - ✅ Schema `resendVerificationSchema` + `verification.service.resendVerification` (`if PENDING && !banned → issueEmailVerification`, senão no-op) + controller + rota
- ✅ **Gate de login** em `auth.service.login` (após a checagem de senha): `bannedAt != null` → **403** ("conta suspensa..."); `status != ACTIVE` → **403** ("verifique seu email..."). Senha errada continua **401** genérico.
  - ✅ Testes: login de `PENDING` → 403; login de banido → 403; login de `ACTIVE` → 200
- ✅ Signup com email banido: **409 genérico** (email `@unique` + linha do banido persiste) continua valendo, sem mensagem especial "banido" (teste de regressão)
- ✅ Atualizado o teste end-to-end que logava logo após signup (agora verifica o email antes do login, extraindo o token do email mockado)
- ✅ Suíte (289) + `typecheck` + `lint` verdes

### ✅ Fase 4.2 — Recuperação de senha (forgot/reset)
> **Firmado:** forgot sempre 200 genérico; reset invalida TODAS as sessões. Token inválido/expirado/usado/`purpose` errado → **400 genérico**; sucesso do reset → **204**. Orquestração em `src/modules/auth/password.service.ts` (espelha `verification.service`). **Nota p/ 4.4:** reset **não** recheca ban/status no consumo do token — o reforço "conta congelada" nesse caminho fica pra 4.4.

- ✅ **POST /api/v1/auth/forgot-password** `{ email }` (público)
  - ✅ Testes: 422 email inválido; **sempre 200 genérico**; email de reset só sai se a conta existe, é `ACTIVE` e não banida (`VerificationToken(PASSWORD_RESET)`, TTL **1h**); email inexistente/PENDING/banido → 200 sem enviar nem criar token
  - ✅ `forgotPasswordSchema` + `password.service.requestPasswordReset` (`if !ACTIVE || banned → no-op`) + controller (200 msg genérica) + rota
- ✅ **POST /api/v1/auth/reset-password** `{ token, newPassword }` (público)
  - ✅ Testes: 422 body inválido (token ausente / `newPassword` fraca reusando `passwordSchema`); token inexistente/expirado/usado/`purpose` errado → **400**; sucesso → **204**, hash da senha nova salvo (login antigo 401 / novo 200), token consome `usedAt`, `consumePasswordReset` derruba TODAS as sessões (refresh antigo → 401); token single-use
  - ✅ `passwordSchema` exportado de `user.schema.ts` + `resetPasswordSchema` + `password.service.resetPassword` + `auth.repository.consumePasswordReset` (`$transaction`: nova senha + consome token + invalida sessões) + controller (204) + rota
- ✅ Suíte (302) + `typecheck` + `lint` verdes

### ✅ Fase 4.3 — Troca de senha (logado)
> **Firmado:** single-step, sem email/código. Exige só a senha atual. Invalida TODAS as sessões (o usuário reloga). Senha atual errada → **403** (request já autenticada; 401 seria lido como "token expirou"). Sucesso → **204**. **Não** recusa `newPassword == currentPassword` (escopo mínimo). **Nota p/ 4.4:** não recheca ban/status (usuário com Bearer válido troca a senha).

- ✅ **POST /api/v1/auth/change-password** `{ currentPassword, newPassword }` (só `authenticate`, sem `canAccess`)
  - ✅ Testes: 401 sem access token; 422 `newPassword` fraca / `currentPassword` ausente; senha atual errada → **403** (senha inalterada, nenhuma sessão cai); sucesso → **204**, hash novo salvo (login antigo 401 / novo 200) + `updatePasswordAndInvalidateSessions` derruba TODAS as sessões, inclusive a atual (refresh antigo → 401)
  - ✅ `changePasswordSchema` (`currentPassword` só `min(1)`; `newPassword` reusa `passwordSchema`) + `password.service.changePassword` (verifica `currentPassword` via bcrypt → 403 se errada → troca) + `auth.repository.updatePasswordAndInvalidateSessions` (`$transaction`: nova senha + invalida sessões) + controller (`getAuthUser`, 204) + rota com `authenticate` inline
- ✅ Suíte (307) + `typecheck` + `lint` verdes

### ✅ Fase 4.4 — Banimento (ban/unban)
> **Firmado:** `POST`/`DELETE /users/:id/ban`; feature `manage:user:status` (manager+admin); proteção de privilegiado (banir/desbanir alvo com `PERMISSION_FEATURES`/`*` exige role admin); banido = conta congelada (login, forgot/reset/resend/change bloqueados; sessões derrubadas). Audit `bannedAt`+`bannedBy`+`banReason` (reason obrigatório). **Decisões desta fase:** sucesso → **204**; auto-ban/-unban → **409**; freeze estendido a reset/change (dono banido → **403**). Ban vive no módulo user (não em submódulo), param `:id`.

- ✅ **POST /api/v1/users/:id/ban** `{ reason }` (`manage:user:status`)
  - ✅ Testes: 401 sem token; 403 sem `manage:user:status`; 422 `:id` inválido / `reason` ausente; 404 alvo inexistente; **403 manager bane alvo admin (privilegiado)**; **409 auto-ban**; 409 já banido; **204** → `bannedAt`/`bannedBy = ator`/`banReason` setados + sessões do alvo invalidadas (refresh → 401, login → 403)
  - ✅ `banUserSchema` + `userService.banUser` + `assertAdminForBan` (features efetivas do alvo via `getUserForFeatureComputation`+`computeEffectiveFeatures`; ator admin por `roles.some(name==="admin")`) + `userRepository.banUserAndInvalidateSessions` (`$transaction`) + controller (204) + rota
- ✅ **DELETE /api/v1/users/:id/ban** (`manage:user:status`)
  - ✅ Testes: mesmos guards (401/403/422/404); **403 manager desbane alvo admin**; **409 auto-unban**; 409 não estava banido; **204** → limpa `bannedAt`/`bannedBy`/`banReason`, `status` preservado, alvo volta a logar (200)
  - ✅ `userService.unbanUser` + `userRepository.unbanUser` + controller + rota (reusa `userParamsSchema`)
- ✅ **Efeito conta-congelada**:
  - ✅ Login de banido → 403 (gate 4.1; teste já existia)
  - ✅ `forgot-password` e `verify-email/resend` de banido → 200 genérico, nenhum email (checagem `!banned` já existia desde 4.1/4.2; testes já cobriam)
  - ✅ `reset-password` (token válido) e `change-password` (Bearer válido) de banido → **403** (checagem `bannedAt` adicionada no `password.service`)
- ✅ Status de resposta do ban decidido: **204** (coerente com DELETE de user)
- ✅ Suíte (326) + `typecheck` + `lint` verdes

### ✅ Fase 4.5 — Fechos
- ✅ Atualizado `ENDPOINTS.md` com as rotas novas (`/auth/verify-email`, `/auth/verify-email/resend`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/change-password`, `POST`/`DELETE /users/:id/ban`) + a feature `manage:user:status` (na coluna Auth das linhas de ban)
- ✅ `CONTEXT.md`: racional da Fase 4 promovido de "planejada" a "implementada/fechada" (§2.1, §3, §4); acrescentadas as decisões da execução (reset/change 204, change-password 403 senha errada, auto-ban 409, `assertAdminForBan` via features efetivas do alvo, freeze estendido a reset/change)
- ✅ **Bug pré-existente corrigido:** `user.service.getUserById` agora autoriza ANTES de buscar (`canActOnResource` antes do `findUserById`, espelhando `deleteUser`) — 403 vence 404, não vaza existência de id. Teste de regressão adicionado (ator sem `read:user:others` → 403 igual para id existente e inexistente); teste do 404 legítimo trocado para ator com `read:user:others`. (`getUserByEmail` tem o mesmo padrão mas é código morto e não dá pra autorizar antes da busca por email — deixado como observação, fora de escopo.)
- ✅ **Bug corrigido — request com JSON malformado → 500:** error handler central passou a mapear o `SyntaxError` do body-parser (`err instanceof SyntaxError && "body" in err`) para **400 BAD_REQUEST** (decisão firmada: 400, não 422). Testes de body malformado/`null` em endpoint representativo (`auth.test.ts` signup).
- ✅ `npm run typecheck` + `npm run lint` + `npm run test:run` (329) limpos; **Fase 4 marcada ✅**

---

## Fase 5 — Documentação da API + Containerização (deploy) 🔄
> Fecha o Ciclo 1 como peça de portfólio: API documentada (OpenAPI gerado dos schemas Zod → UI Scalar → coleção Bruno) e no ar via Docker (git clone → um `docker compose up` sobe banco + app buildado, migra e semeia do zero). Decisões e racional no `CONTEXT.md` (§ a criar). Fonte única da doc: os próprios schemas Zod via `.meta()` (Zod 4 nativo, sem monkey-patch). Cada seção abaixo é uma feat-branch a partir da branch `fase-5`.
>
> **Decisões firmadas:** demo read-only = role `demo` (`appliesTo EMPLOYEE`) com todas as features de leitura (`read:user`, `read:user:others`, `read:session`, `read:feature`, `read:role`, `read:permission`) — GET em toda a API, escrita → 403 (RBAC ao vivo). Seed do **usuário** demo gated por `SEED_DEMO_USER=true` (ligado no Docker/prod, desligado em test/dev); a **role** `demo` é sempre semeada. `/openapi.json` e `/reference` são rotas públicas (montadas no `router` de topo, fora dos grupos protegidos). Migração em produção usa `prisma migrate deploy` (nunca `migrate dev`). Segredos via `.env` não-versionado + `.env.example`.

### ✅ Fase 5.0 — Fundação (deps + env)
- ✅ Instalar `zod-openapi`, `@scalar/express-api-reference` (deps de runtime).
- ✅ `src/config/env.ts` + `env.example`: `SEED_DEMO_USER` (`z.stringbool()`, default `false`), `DEMO_EMAIL` (default `demo@petoasis.dev`), `DEMO_PASSWORD` (default público que satisfaz `passwordSchema`, ex. `DemoOasis2026!`). Grupo `# Demo` no `env.example`.
- ✅ Checkpoint: `npm run typecheck` + `npm run lint` verdes (app boota lendo os defaults novos).

### ✅ Fase 5.1 — Seed do usuário demo (read-only)
- ✅ `role.constants.ts`: adicionada role `demo` a `DEFAULT_ROLES` — `appliesTo: ProfileKind.EMPLOYEE`, features `[read:user, read:user:others, read:session, read:feature, read:role, read:permission]` (grupo `DEMO_READ_FEATURES` deduplicado). `RoleName`/`ROLE_NAMES` ganham `"demo"` automaticamente.
- ✅ `prisma/seed.ts`: após sincronizar features/roles, **se `env.SEED_DEMO_USER`**, upsert idempotente do usuário demo por `email` — perfil `Employee`, `status: ACTIVE`, vínculo com a role `demo`, `passwordHash` via `hashPassword` (bcrypt + `PEPPER`). O `update` limpa `bannedAt/bannedBy/banReason` (redeploy restaura o demo).
- ✅ Testes: `db:seed` 2× com `SEED_DEMO_USER=true` → 1 usuário demo (idempotente, verificado no dev DB). Suíte (329) verde com o flag desligado no test DB.
- ✅ Checkpoint (smoke antecipado no host): login do demo → **200**; `GET /users` e `GET /roles` → **200**; `POST /users` e `DELETE /users/:id` → **403** (RBAC ao vivo).

### ✅ Fase 5.2 — OpenAPI via `zod-openapi` (`.meta()`, sem monkey-patch)
- ✅ Schemas anotados com `.meta({ description, example, id? })` (Zod 4 nativo). Aplicado nos 6 `*.schema.ts` (request) e 6 `*.presenter.ts` (response) — views viram componentes nomeados (`UserOwner`, `Session`, `Me`, `Role`, `Feature`, ...). Views são whitelist → exemplos de response sem campo sensível (verificado: doc não contém `passwordHash`/`tokenHash`).
- ✅ `src/docs/openapi.ts` (+ `components.ts`, `helpers.ts`, `paths/<módulo>.ts`): documento montado com `createDocument`. Helper `fromEnvelope` extrai `.shape.body`/`.shape.params`/`.shape.query` com guarda de presença, sem quebrar a convenção `{ body, params, query }`. 27 paths registrados por módulo.
- ✅ Prefixo `/api/v1` via `servers: [{ url: "/api/v1" }]` (relativo → resolve contra a origem). `components.securitySchemes.bearerAuth` (JWT) global; operações públicas sobrescrevem com `security: []`.
- ✅ **`GET /openapi.json`** (público) montado no `router` de topo (fora de `authenticate`), servindo o documento memoizado.
- ✅ Testes (`openapi.test.ts`, 4 casos): sem token → **200** + `content-type` JSON; `openapi === "3.1.0"`, `servers[0].url === "/api/v1"`, `bearerAuth` presente, paths-amostra (`/auth/login`, `/users`, `/roles`); doc **não** contém `passwordHash`/`tokenHash`/`refreshTokenHash`. Suíte completa 333 verde. 🔸 linter Redocly/Spectral fica como polish opcional.

### ✅ Fase 5.3 — UI Scalar (`/reference`)
- ✅ **`GET /reference`** (público, `router` de topo): `@scalar/express-api-reference` (`src/docs/reference.ts`) consumindo `url: "/openapi.json"`, `authentication.preferredSecurityScheme: "bearerAuth"` (Bearer preenchível no “try it”), tema `deepSpace`. Bundle carregado via CDN jsdelivr client-side (ver aviso de CSP na Fase 6.1).
- ✅ Testes (`reference.test.ts`): `GET /reference` sem token → **200** + `content-type` HTML; HTML referencia `/openapi.json` e o Scalar. Suíte 335 verde. Smoke em runtime confirmou o fluxo “try it”: login do demo → **200** em `GET /users` → **403** em `DELETE /users/:id` (RBAC ao vivo).
- ✅ 🔸 Tema `deepSpace` aplicado (ajuste fino de branding fica opcional).

### ⬜ Fase 5.4 — README *(adiada para o fim da Fase 5)*
- ⬜ Reescrever/expandir o `README.md`: visão do projeto, stack, arquitetura em camadas (route→controller→service→repository), **como subir com Docker** (git clone → `.env` → um comando), fluxo de dev local (`services:up` + `npm run dev` com tsx no host), **credenciais públicas do demo**, links para `/reference` e `/openapi.json`, ponteiro para a coleção Bruno em `/api-collection`.
- ⬜ 🔸 Badges, screenshot da UI Scalar, índice.

### ✅ Fase 5.5 — Coleção Bruno versionada (`/api-collection`)
- ✅ `api-collection/` versionada, organizada **por módulo** (`status/`, `auth/`, `me/`, `users/`, `profiles/`, `permissions/`, `roles/`, `features/`) — 35 requests cobrindo os ~30 endpoints. `bruno.json` + `collection.bru` (bearer no nível da coleção). Biome ignora `api-collection`.
- ✅ Environments `local` (`http://localhost:3000/api/v1`) e `prod` (baseUrl placeholder `https://SEU-DOMINIO/api/v1`, a preencher na 5.8).
- ✅ Fluxo de auth: `Login` (demo) com `script:post-response` salvando o access token via **`bru.setVar`** (runtime, **não** `setEnvVar` — evita gravar segredo no `.bru` versionado / futuro Bruno v4); auth bearer `{{accessToken}}` herdada por `auth: inherit`. `Get Me`/`List Users`/`List Roles`/`List Features`/`List Sessions` capturam ids (`userId`/`roleId`/`featureId`/`sessionId`) para as rotas com path param.
- ✅ Checkpoint validado com `@usebruno/cli`: Login → **200** + token (assert ✓); varredura das 8 pastas não-auth → leituras **200**, escritas do demo **403** (RBAC ao vivo), inheritance + chaining de ids OK. `typecheck`/`lint`/suíte (335) verdes.

### ⬜ Fase 5.6 — Dockerfile (app buildado)
- ⬜ `Dockerfile` multi-stage: **build** (instala deps, `prisma generate`, `npm run build` via tsup) → **runtime** (node slim, copia `dist/` + client Prisma gerado + deps de produção, usuário não-root, `EXPOSE`, entrypoint). `.dockerignore` (node_modules, dist local, .env, .git).
- ⬜ Checkpoint: `docker build` conclui; `docker run` do container sobe o processo (com um banco alcançável).

### ⬜ Fase 5.7 — Compose full-stack (sem quebrar o dev)
- ⬜ Adicionar serviço **`app`** ao `docker-compose.yml` sob **profile** (ex. `profiles: ["full"]`) — assim `docker compose up -d` (dev, via `services:up`) continua subindo **só** `db`/`db_test`/`mailpit` e o app roda no host via tsx; o app-em-container só sobe no profile. `depends_on: db` com healthcheck; env via `.env`.
- ⬜ **Entrypoint de subida (do zero, produção):** `prisma migrate deploy` (nunca `migrate dev`) → `prisma db seed` (com `SEED_DEMO_USER=true`) → `node dist/server.js`. Migração e seed acontecem na subida, ambiente sai do zero funcionando.
- ⬜ `package.json`: sugerir scripts `db:deploy` (`prisma migrate deploy`) e `stack:up` (`docker compose --profile full up -d --build`) — mantendo o padrão “prefira scripts” do `CLAUDE.md`. `services:up` permanece **inalterado** (dev).
- ⬜ `.env.example`: todas as chaves necessárias para o full-stack — `POSTGRES_*`, `DATABASE_URL` (host = nome do serviço `db`), `JWT_SECRET`/`PEPPER` (≥32), `SMTP_*`/`MAIL_FROM`/`APP_URL`, `SEED_DEMO_USER`/`DEMO_EMAIL`/`DEMO_PASSWORD`, `CORS`/`PORT`. `.env` **não versionado**.
- ⬜ Checkpoint (do zero): `docker compose --profile full up --build` num clone limpo → `db` + `app` sobem, migrations aplicadas, seed rodado; `GET /api/v1/status` → **200**; `GET /openapi.json` → **200**; `curl /reference` → **200**; login do demo → **200** e `DELETE` → **403**.

### ⬜ Fase 5.8 — Deploy no servidor
- ⬜ Documentar o passo-a-passo (no `README.md` ou `DEPLOY.md`): clone → preencher `.env` de produção → `docker compose --profile full up -d --build`. `APP_URL`/CORS apontando para o domínio real; migração já via `migrate deploy` no entrypoint.
- ⬜ 🔸 Nota de infra fora do escopo da app: reverse proxy/TLS (Caddy/nginx), backup de volume do Postgres — responsabilidade de deploy, não da aplicação.

### ⬜ Fase 5.9 — Fechos
- ⬜ **`CONTEXT.md`:** registrar o racional das decisões desta fase numa seção nova (ex. `§2.3 — Fase 5 (Documentação + Deploy)`): **fonte única Zod→OpenAPI** (`.meta()` nativo, sem monkey-patch; envelope extraído por `.shape.*`; presenters garantindo exemplos sem campo sensível), **demo read-only + seed gated** (`SEED_DEMO_USER`, role `demo` sempre semeada), **containerização** (`migrate deploy` vs `migrate dev`, segredos via `.env`, profile `full` para não quebrar o fluxo de dev). Relabelar o antigo `§2.2 “Fase 5 (planejada)”` para `“Fase 6 (planejada)”`.
- ⬜ `ENDPOINTS.md`: adicionar `GET /openapi.json` e `GET /reference` (públicas).
- ⬜ `npm run typecheck` + `npm run lint` + `npm run test:run` verdes; **Fase 5 marcada ✅**.

---

## Fase 6 — Hardening e polimento 🔄
> Amplia o escopo original ("rate limiting, account lockout") para incluir também polimento de features já construídas. Decisões e racional completos no `CONTEXT.md` (§2.2). Cada seção abaixo é uma feat-branch em TDD, a partir da branch `fase-6`.

### ⬜ Fase 6.0 — Fundação de infra
- ⬜ Serviço `redis` no `docker-compose.yml` (+ script `npm run` análogo aos `services:*`/`mail:up`); `REDIS_URL` em `env.ts`/`env.example`; client em `src/lib/redis.ts`.
- ⬜ `app.set("trust proxy", ...)` (assume um hop de proxy reverso — ajustar se a topologia de deploy for outra) para IP real chegar certo no rate limit/lockout.
- ⬜ `express.json({ limit: "100kb" })` (ajustável).
- ⬜ `pino` + `pino-http` instalados (base para 6.3).

### ⬜ Fase 6.1 — Helmet + CORS explícito
- ⬜ `helmet()` (preset default).
- ⬜ ⚠️ **CSP × Scalar (Fase 5.3):** a UI em `/reference` carrega o bundle do Scalar do CDN `cdn.jsdelivr.net` client-side. O `helmet()` default já liga um `Content-Security-Policy` com `script-src 'self'`, que **bloquearia** esse CDN (e o `/reference` quebra). Ao ligar o helmet, resolver uma destas: (a) allowlistar `https://cdn.jsdelivr.net` no `script-src` (e o que mais o bundle exigir); (b) passar um `nonce` por request pro `apiReference` (`script-src 'nonce-...'`, `style-src` ainda precisa de `'unsafe-inline'`); ou (c) auto-hospedar o bundle e servir do próprio domínio. Testar `GET /reference` no navegador (não só `curl`) após ligar o helmet.
- ⬜ CORS com allowlist a partir de `APP_URL` (+ eventual `CORS_ALLOWED_ORIGINS` separado por vírgula), `credentials: true`.

### ⬜ Fase 6.2 — Consolidar guards de escalação
- ⬜ Extrair `assertActorIsAdmin` (nome a definir) em `src/lib/authorization.ts`.
- ⬜ `assertAdminForBan` (`user.service.ts`), `assertAdminForPermissionFeature` e `assertAdminForRoleAssignment` (`permission.service.ts`) passam a reusá-lo, mantendo seu próprio predicado de "alvo/feature/role privilegiado".
- ⬜ Suíte de escalação existente continua verde sem alteração (refactor comportamento-preservado) + teste unitário do helper novo.

### ⬜ Fase 6.3 — Log de acesso HTTP
- ⬜ `pino-http` logando toda request em stdout (JSON): método, rota, status, duração, IP (via `req.ip`), user-agent, request-id, `userId` quando autenticado.
- ⬜ Nunca logar body, header `Authorization`, cookies ou senha.
- ⬜ Nota: retenção/agregação fora da app fica fora de escopo desta fase (responsabilidade de infra/deploy).

### ⬜ Fase 6.4 — Audit log de ações sensíveis
- ⬜ Migration: model `AuditLog` (id, actorId?, action, targetType, targetId?, metadata Json?, ip?, userAgent?, createdAt).
- ⬜ `src/lib/auditLog.ts` (`record(action, {actorId, targetType, targetId, metadata?, ip?, userAgent?})`).
- ⬜ Chamado nos pontos: login falho, lockout disparado, conta desbloqueada, ban/unban, grant/revoke de role, grant/revoke de permission override, password reset (solicitado e concluído), password change, troca de email (solicitada e concluída), forçar troca de senha, criação e deleção de usuário.
- ⬜ Sem endpoint de leitura nesta fase (ver racional no `CONTEXT.md`).

### ⬜ Fase 6.5 — Rate limiting nas rotas de auth
- ⬜ `rate-limiter-flexible` com `RateLimiterRedis`.
- ⬜ Regras propostas (por IP, ajustáveis): `login` 20/15min; `signup` 5/1h; `forgot-password` 5/1h; `verify-email/resend` 5/1h.
- ⬜ Resposta 429 genérica (não revela qual regra disparou).
- ⬜ Excedido → também gera entrada no audit log (`rate_limit_exceeded`).

### ⬜ Fase 6.6 — Account lockout + desbloqueio pelo admin
- ⬜ Contador de falhas por conta em Redis; threshold e janela fixa propostos (ex. 5 falhas → 15min), backoff exponencial depois (dobra a cada ciclo até um teto) — números exatos confirmados no início da feature.
- ⬜ Reset completo (contador + backoff) no login certo.
- ⬜ Checagem entra em `auth.service.login`, ao lado dos gates de `bannedAt`/`status`.
- ⬜ **`DELETE /users/:id/lock`** (`manage:user:status`; guarda de privilegiado reusando o helper da 6.2) — desbloqueia, reset completo, 204 sucesso, 409 se não estava travada; registra no audit log.
- ⬜ Sem lock manual pelo admin nesta fase (só o desbloqueio) — fora de escopo, backlog se necessário.

### ⬜ Fase 6.7 — Teto de sessões vivas + faxina de tokens mortos
- ⬜ Teto de sessões vivas simultâneas por usuário (número a confirmar); evict da mais antiga ao exceder (login nunca é recusado).
- ⬜ Script de faxina (hard delete) de `Session`/`VerificationToken` mortos há mais de um período de retenção a definir (ex. 30 dias) — rodado via `npm run` script, não automático dentro do request/response.

### ⬜ Fase 6.8 — Paginação/filtro em `GET /users`
- ⬜ `?page=&limit=` (offset-based, `limit` máximo a definir), resposta `{ data, meta: { page, limit, total } }`.
- ⬜ Filtros: `status`, `banned` (via `bannedAt`), `role`.

### ⬜ Fase 6.9 — Troca de email *(desenho a confirmar no início da feature)*
- ⬜ Reabre a decisão de `user.schema.ts:56` (hoje bloqueada). Proposta a validar: endpoint próprio autenticado, senha atual exigida (como change-password), fluxo de 2 passos com verificação no email novo antes de efetivar (`pendingEmail` + `VerificationPurpose.EMAIL_CHANGE`).
- ⬜ Pontos a decidir na feature: notifica o email antigo da troca? o que acontece se o novo email já existe (conflito)? TTL do pending?

### ⬜ Fase 6.10 — Forçar troca de senha, ação do admin *(desenho a confirmar)*
- ⬜ Proposta: flag `mustChangePassword` no `User`; endpoint que a ativa + invalida sessões do alvo (feature a definir — provável `manage:user:status`).
- ⬜ Ponto a decidir na feature: login com a flag ativa bloqueia acesso até trocar, ou deixa entrar sinalizando pro front forçar a troca?

### ⬜ Fase 6.11 — Polir `GET /auth/sessions`
- ⬜ Parsing de user-agent (ex. `ua-parser-js`) → `{ device: "Chrome no Windows", ipAddress, createdAt, current }`, marcando a sessão da request atual.

### ⬜ Fase 6.12 — Fechos
- ⬜ `ENDPOINTS.md` atualizado com todas as rotas novas.
- ⬜ `CONTEXT.md`: promover racional de "planejada" a "implementada", com as decisões efetivamente confirmadas em cada sub-fase (inclusive 6.9/6.10).
- ⬜ `npm run typecheck` + `npm run lint` + suíte completa verdes; Fase 6 marcada ✅.

---

## Fases seguintes (resumo)
- **Fase 5 — Documentação da API + Containerização:** OpenAPI gerado dos schemas Zod (`.meta()`) → UI Scalar em `/reference` + `/openapi.json`, usuário demo read-only, coleção Bruno, Docker full-stack (detalhado acima).
- **Fase 6 — Hardening e polimento:** rate limiting, account lockout, audit log, guards de escalação consolidados, paginação/filtros (detalhado acima).
- **Fase 7 — Domínio pet shop:** model Pet (Customer 1:N), CRUD aninhado em customers, scopes own/others, views owner/staff.

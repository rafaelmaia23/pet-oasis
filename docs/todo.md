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

> Introduz status de conta com verificação de email obrigatória, um serviço de email genérico (nodemailer; mailpit em dev / Resend em prod), troca/recuperação de senha e banimento. Regras de negócio decididas no planejamento e registradas no `docs/context.md` (seção "Fase 4"). Cada seção abaixo é uma feat-branch em TDD (teste primeiro, código depois).
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
- ✅ Atualizado `docs/endpoints.md` com as rotas novas (`/auth/verify-email`, `/auth/verify-email/resend`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/change-password`, `POST`/`DELETE /users/:id/ban`) + a feature `manage:user:status` (na coluna Auth das linhas de ban)
- ✅ `docs/context.md`: racional da Fase 4 promovido de "planejada" a "implementada/fechada" (§2.1, §3, §4); acrescentadas as decisões da execução (reset/change 204, change-password 403 senha errada, auto-ban 409, `assertAdminForBan` via features efetivas do alvo, freeze estendido a reset/change)
- ✅ **Bug pré-existente corrigido:** `user.service.getUserById` agora autoriza ANTES de buscar (`canActOnResource` antes do `findUserById`, espelhando `deleteUser`) — 403 vence 404, não vaza existência de id. Teste de regressão adicionado (ator sem `read:user:others` → 403 igual para id existente e inexistente); teste do 404 legítimo trocado para ator com `read:user:others`. (`getUserByEmail` tem o mesmo padrão mas é código morto e não dá pra autorizar antes da busca por email — deixado como observação, fora de escopo.)
- ✅ **Bug corrigido — request com JSON malformado → 500:** error handler central passou a mapear o `SyntaxError` do body-parser (`err instanceof SyntaxError && "body" in err`) para **400 BAD_REQUEST** (decisão firmada: 400, não 422). Testes de body malformado/`null` em endpoint representativo (`auth.test.ts` signup).
- ✅ `npm run typecheck` + `npm run lint` + `npm run test:run` (329) limpos; **Fase 4 marcada ✅**

---

## Fase 5 — Documentação da API + Containerização (deploy) ✅
> Fecha o Ciclo 1 como peça de portfólio: API documentada (OpenAPI gerado dos schemas Zod → UI Scalar → coleção Bruno) e no ar via Docker (git clone → um `docker compose up` sobe banco + app buildado, migra e semeia do zero). Decisões e racional no `docs/context.md` (§ a criar). Fonte única da doc: os próprios schemas Zod via `.meta()` (Zod 4 nativo, sem monkey-patch). Cada seção abaixo é uma feat-branch a partir da branch `fase-5`.
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

### ✅ Fase 5.4 — README *(feito no fecho da Fase 5, junto com 5.8/5.9)*
- ✅ `README.md` (novo, PT-BR): visão do projeto, stack, arquitetura em camadas (route→controller→service→repository + presenter/RBAC/soft delete), **subir com Docker** (git clone → `cp env.example .env` → `npm run stack:up`), fluxo de dev local (`services:up` + `npm run dev` com tsx), **credenciais públicas do demo** (`demo@petoasis.dev`/`DemoOasis2026!`), links para `/reference` e `/openapi.json`, ponteiro para a coleção Bruno em `api-collection/`, tabela de comandos, roadmap e licença (ISC).
- 🔸 Badges/screenshot da UI Scalar ficaram de fora (polish opcional).

### ✅ Fase 5.5 — Coleção Bruno versionada (`/api-collection`)
- ✅ `api-collection/` versionada, organizada **por módulo** (`status/`, `auth/`, `me/`, `users/`, `profiles/`, `permissions/`, `roles/`, `features/`) — 35 requests cobrindo os ~30 endpoints. `bruno.json` + `collection.bru` (bearer no nível da coleção). Biome ignora `api-collection`.
- ✅ Environments `local` (`http://localhost:3000/api/v1`) e `prod` (baseUrl placeholder `https://SEU-DOMINIO/api/v1`, a preencher na 5.8).
- ✅ Fluxo de auth: `Login` (demo) com `script:post-response` salvando o access token via **`bru.setVar`** (runtime, **não** `setEnvVar` — evita gravar segredo no `.bru` versionado / futuro Bruno v4); auth bearer `{{accessToken}}` herdada por `auth: inherit`. `Get Me`/`List Users`/`List Roles`/`List Features`/`List Sessions` capturam ids (`userId`/`roleId`/`featureId`/`sessionId`) para as rotas com path param.
- ✅ Checkpoint validado com `@usebruno/cli`: Login → **200** + token (assert ✓); varredura das 8 pastas não-auth → leituras **200**, escritas do demo **403** (RBAC ao vivo), inheritance + chaining de ids OK. `typecheck`/`lint`/suíte (335) verdes.

### ✅ Fase 5.6 — Dockerfile (app buildado)
- ✅ `Dockerfile` multi-stage (`node:22-bookworm-slim` nos dois stages, p/ o prebuilt do `bcrypt` bater): **deps** (`npm ci --omit=dev` → node_modules de produção) · **build** (`npm ci` completo → `npm run db:generate` → `npm run build` via tsup) → **runtime** (copia `node_modules` de produção + `dist/` + `package.json`, `USER node`, `EXPOSE 3000`, `CMD ["node","dist/server.js"]`).
  - ✅ **Client Prisma gerado NÃO é copiado** ao runtime: o tsup resolve o alias `@/*` e **embute** `src/generated/prisma` no bundle; o query-compiler wasm do Prisma 7 vem de `node_modules/@prisma/client` (dep de produção) via `import()`. Logo runtime = deps de produção + bundle.
  - ✅ `prisma generate` exige `env("DATABASE_URL")` resolvível ao carregar `prisma.config.ts` (não conecta) → placeholder `ENV DATABASE_URL` só no stage build (não vaza pro runtime).
- ✅ `.dockerignore` (node_modules, dist, coverage, `src/generated`, `src/__tests__`, .env, .git, api-collection, docs, `**/*.md`, etc.).
- ✅ Checkpoint: `docker build` conclui (bundle 144 KB); container roda **não-root** (`uid=1000 node`); `docker run` (com `DATABASE_URL`/`JWT_SECRET`/`PEPPER`) → "Server is running on port 3000"; `GET /api/v1/status` → **200** (consulta o Postgres de fato: `version 16.14`, `opened_connections: 1` → bundle + Prisma client OK); `GET /openapi.json` → **200**. `typecheck`/`lint` verdes.
- 🔸 **Nota p/ 5.7:** o seed roda `tsx prisma/seed.ts` importando de `src/`, que não existe na imagem de produção — a estratégia de seed no container fica pra 5.7 (que também estende o stage runtime com schema/migrations/CLI + entrypoint `migrate deploy`→seed→start).

### ✅ Fase 5.7 — Compose full-stack (sem quebrar o dev)
- ✅ Serviço **`app`** no `docker-compose.yml` sob `profiles: ["full"]` — `docker compose up -d` (dev, `services:up`) continua subindo **só** `db`/`db_test`/`mailpit` (verificado: app ausente); o app-em-container só sobe com `--profile full`. `depends_on: db` com `condition: service_healthy` (healthcheck `pg_isready` adicionado ao `db`).
- ✅ **DATABASE_URL (Opção A):** o `.env` mantém `localhost` (tooling no host); o serviço `app` **deriva a própria** `DATABASE_URL` apontando p/ `db:5432` a partir de `POSTGRES_*`, dentro do compose. Dev intacto. `SMTP_HOST: mailpit` no app p/ alcançar o mailpit na rede do compose.
- ✅ **Seed no container (resolve a nota da 5.6):** `prisma/seed.ts` virou 2ª entry do tsup (`entry: { server, seed }`) → `dist/seed.js` auto-contido (bundle 55 KB), sem tsx/src no runtime. Dev segue com `prisma db seed` (tsx) inalterado.
- ✅ **Entrypoint** (`docker-entrypoint.sh`, `ENTRYPOINT` no stage runtime): `prisma migrate deploy` (nunca `migrate dev`) → `node dist/seed.js` (features/roles + demo, `SEED_DEMO_USER=true`, idempotente) → `exec node dist/server.js`. Runtime ganhou `prisma/` (schema+migrations) + `prisma.config.ts`; CLI `prisma` já é dep de produção. **`migrate deploy` carrega o `prisma.config.ts` (TS) nativamente, sem tsx** (confirmado em runtime).
- ✅ `package.json`: `db:deploy` (`prisma migrate deploy`), `stack:up` (`docker compose --profile full up -d --build`), `stack:down` (paridade). `services:up` **inalterado**.
- ✅ `env.example`: comentários esclarecendo os dois contextos de `DATABASE_URL` (host localhost vs. app deriva `@db`) + reforço `JWT_SECRET`/`PEPPER` ≥32 e `APP_URL` = domínio em prod. `.env` **não versionado**.
- ✅ Checkpoint (do zero, `down -v` → `stack:up`): migrations aplicadas → seed (17 features, 5 roles, demo) → "Server is running on port 3000"; `GET /api/v1/status`/`/openapi.json`/`/reference` → **200**; login do demo → **200** + token; `GET /users` → **200**; `DELETE /users/:id` → **403** (RBAC ao vivo). `typecheck`/`lint`/suíte (335) verdes.
- 🔸 Aviso cosmético do Prisma no runtime slim ("Prisma failed to detect libssl/openssl") — `migrate deploy` conclui normalmente (o driver adapter do Prisma 7 não usa o engine binário). Silenciar via `apt-get install -y openssl` no runtime fica como polish opcional.

### ✅ Fase 5.8 — Deploy no servidor
- ✅ Passo-a-passo documentado como **seção "Deploy em servidor" no `README.md`** (coube numa tela → não precisou de `DEPLOY.md` separado): clone → `cp env.example .env` de produção (`JWT_SECRET`/`PEPPER` fortes ≥32, `APP_URL` = domínio real, SMTP reais, `DEMO_*` opcional) → `npm run stack:up`; migração via `migrate deploy` no entrypoint.
- ✅ 🔸 Nota de infra fora do escopo da app registrada no README: reverse proxy/TLS (Caddy/nginx), backup do volume `postgres_data`, firewall. CORS ainda não configurado (é Fase 6.1) — não prometido no README.

### ✅ Fase 5.9 — Fechos
- ✅ **`docs/context.md`:** nova `§2.3 Fase 5 (implementada) — Documentação + Deploy` no estilo "Por que...": fonte única Zod→OpenAPI (`.meta()` nativo, envelope via `.shape.*`, presenters sem campo sensível), demo read-only + seed gated, `migrate deploy` vs `migrate dev`, seed bundlado (`dist/seed.js`), profile `full`, `DATABASE_URL` derivada (`@db`), imagem multi-stage não-root. Antigo `§2.2 "Fase 5 (planejada)"` relabelado para `"Fase 6 (planejada)"` (+ history `Fase 5 (fechada)` no §4).
- ✅ `docs/endpoints.md`: seção "Docs" com `GET /openapi.json` e `GET /reference` (públicas, router de topo); cabeçalho/Mounting de-stalados (OpenAPI existe agora).
- ✅ `npm run typecheck` + `npm run lint` + `npm run test:run` (335) verdes; **Fase 5 marcada ✅**.

---

## Fase 6 — Ambientes, Docker por ambiente e deploy ✅
> Reformula dev/test/prod para um **Compose base + overrides** por ambiente, corrige dois bugs de deploy (app hardcodado no mailpit em vez da Resend; prod subindo db/mailpit de dev) e adiciona **graceful shutdown**. Nenhuma regra de negócio nova. Racional no `docs/context.md` (§2.4) e no ADR `docs/adr/environments-and-deploy.md`. Branch `fase-6`.

### ✅ Fase 6.0 — Env files + dotenv-cli
- ✅ `.env.development`/`.env.test`/`.env.production` (fora do git) + `.env.example` versionado; `.gitignore` ampliado (`.env.*` com `!.env.example`). `dotenv-cli` (devDep).
- ✅ Colapsadas as 5 fontes de env: a URL do banco de teste (antes duplicada em 4 lugares) vive só no `.env.test`; `vitest.config.ts` carrega `.env.test` (`override:true` → `npx vitest run <arquivo>` funciona sozinho); `global.ts` sem prefixos inline. `env.ts`/`prisma.config.ts` intocados (o `import "dotenv/config"` vira no-op).

### ✅ Fase 6.1 — Graceful shutdown (SIGTERM) — TDD
- ✅ `src/lib/shutdown.ts` (`createShutdownHandler`, injeção de dependência): `server.close()` (drena in-flight) → `prisma.$disconnect()` → exit, com timeout de força-saída (10s) e guarda de dupla-invocação. 5 testes unitários (ordem, falha de close, falha de disconnect, dupla-sinal, timeout).
- ✅ `server.ts` captura o `http.Server` e registra SIGTERM/SIGINT.

### ✅ Fase 6.2 — Dockerfile stage `dev` + entrypoint de dev
- ✅ Stage `dev` (npm ci completo, sem bundle/prune, root p/ evitar EACCES no bind-mount); `runtime` de prod intocado. `docker-entrypoint.dev.sh`: `exec tsx watch` (PID 1) após generate → migrate deploy → seed. `.dockerignore` exclui `.env.*`.

### ✅ Fase 6.3 — Compose base + dev/prod/test overrides
- ✅ `docker-compose.yml` (base, esqueleto do app) + `.dev`/`.prod`/`.test`. Isolamento por `-p pet-oasis-{dev,test,prod}` + container/volume/porta distintos (dev e test rodam juntos). Prod só app + Postgres-de-prod (SMTP do `.env.production` → mata o **bug 1**; sem mailpit/db-de-dev → mata o **bug 2**). Dev com bind-mount `./src`/`./prisma` + volume anônimo `/app/src/generated`. Test só Postgres-de-test (mailpit atrás de `--profile mail`).

### ✅ Fase 6.4 — Scripts por ambiente
- ✅ `dev`/`dev:down`/`dev:reset`/`dev:mail`; `prod:up`/`prod:down`/`prod:logs`; `test` (sobe test-db isolado, Vitest no host, teardown **garantido** por trap de EXIT) + `test:services:up`/`down`; `db:migrate`/`db:seed`/`db:studio` prefixados com `dotenv -e .env.development` (`db:migrate` = `migrate dev`, autoria consciente). Removidos `services:*`/`stack:*`/`db:test:*`/`mail:up`/`test:run` (+ profile `full`).

### ✅ Fase 6.5 — Guarda + docs + fechos
- ✅ Teste-guarda `clearDatabase.guard.test.ts` (afirma que Feature/Role/RoleFeature sobrevivem ao `clearDatabase` — não era bug) + comentário no helper.
- ✅ ADR `docs/adr/environments-and-deploy.md`; `docs/context.md` §2.4 + renumeração da antiga "Fase 6 (planejada)" → "Fase 7 (planejada)"; `README.md`/`CLAUDE.md`/`docs/documenting-endpoints.md` atualizados; TODO renumerado (antigas Fase 6→7 Hardening, Fase 7→8 Domínio).
- ✅ `typecheck` + `lint` + suíte verdes; verificação ponta a ponta dos 3 ambientes (dev: boot + status 200 + demo off + SIGTERM gracioso; `npm test`: suíte + teardown; prod: bug1/bug2 + status 200 + demo login 200 + SIGTERM gracioso).

---

## Fase 7 — Hardening e polimento 🔄

> Amplia o escopo original ("rate limiting, account lockout") para incluir também observabilidade e polimento de features já construídas. Decisões e racional completos no `docs/context.md` (§2.2), em `docs/logging-policy.md` e nos ADRs `rate-limiting-and-lockout.md` / `pagination.md`. Cada sub-fase é uma feat-branch em TDD (`feat/fase-7-<m>-<slug>` → merge `--no-ff` na `fase-7`).
>
> **Reorganização em relação ao plano anterior:** o antigo item único "audit log" virou **três categorias de log** com sub-fases próprias (access / application / audit); a paginação foi **movida para antes** dos endpoints de leitura, para ser extraída como helper reutilizável (a Fase 9 depende dela); o audit log **ganhou endpoint de leitura** (decisão anterior revertida); entraram itens novos de hardening (rate limit por destinatário, timeouts) e o reset do ambiente demo.

### Decisões firmadas no planejamento da fase

| # | Decisão | Escolha |
|---|---|---|
| D1 | 7.12 "refresh token hasheado" | **Já implementado desde a Fase 3** (`Session.refreshTokenHash` = sha256, `src/lib/token.ts`). Rebaixada a teste de regressão na 7.19. HMAC com PEPPER analisado e recusado → `docs/backlog.md`. |
| D2 | Redis indisponível | **Fail-open.** Rate limit e lockout são ignorados, o request segue, a falha emite `error` (+ Sentry). O Redis não vira SPOF do login. |
| D3 | CSP × Scalar | **Auto-hospedar o bundle** do Scalar → `script-src 'self'` de verdade, `/reference` funciona offline. |
| D4 | Envelope de paginação | `{ data, meta }` em **todas** as listagens (breaking change assumido de uma vez). Exceção: `GET /users/:userId/permissions` segue `string[]`. |
| D5 | IP no `GET /audit-logs` | Feature **`read:audit-log:full`** destrava o IP inteiro; sem ela, mascarado. Catálogo novo, no singular: `read:log`, `read:audit-log`, `read:audit-log:full`. |
| D6 | Axiom + Sentry | **Ambos** na fase, ativando só com as env vars presentes; ausentes → stdout + ring buffer, boot normal. |
| D7 | Trust proxy | Deploy tem proxy reverso na frente → `app.set("trust proxy", 1)`. |
| D8 | Valores numéricos | Aceitos os propostos, **todos por env var** (tabela no ADR de rate limiting; `limit` de paginação no ADR de paginação). |

Continuam **deferidas por design**: o desenho de 7.15 (troca de email) e 7.16 (forçar troca de senha) é confirmado na abertura da Sessão H.

### Sessões de trabalho

As sub-fases mantêm a numeração `7.0–7.19`; as sessões agrupam-nas em blocos executáveis, **nesta ordem**:

| Sessão | Sub-fases | Tema | Por que agrupa |
|---|---|---|---|
| **A** ✅ | 7.0, 7.1, 7.2 | Fundação de infra + bordas + guards | Redis/env/deps, helmet+CORS+Scalar auto-hospedado e o refactor dos 3 guards. Nada aqui depende de log. |
| **B** ✅ | 7.3, 7.4, 7.5 | Observabilidade interna | Logger + `AsyncLocalStorage` + ring buffer são inúteis sem consumidor; access e application log são os consumidores. |
| **C** | 7.6 | Audit log | Migration + taxonomia + `auditLog.record` + ~18 pontos de chamada. Grande sozinha. |
| **D** | 7.7, 7.8 | Paginação + leitura de log | 7.8 consome o helper da 7.7 (cursor em `/audit-logs`); a 7.7 já migra todas as listagens para o envelope. |
| **E** | 7.10, 7.11 | Rate limit + lockout | Mesma infra (Redis), mesmo endpoint alvo (`/auth/login`), mesmas ações de audit. |
| **F** | 7.9, 7.13 | Bordas externas e resiliência | Axiom/Sentry e os timeouts tratam o mesmo problema: dependência externa que falha ou pendura. |
| **G** | 7.14, 7.18 | Scripts de manutenção + agendamento | `cleanup-sessions`, `cleanup-audit-log` e `demo-reset` compartilham `--dry-run`, transação, log de resultado e systemd timer. |
| **H** | 7.15, 7.16, 7.17 | Polimento de features de conta | As três mexem no domínio de conta/sessão. **Abre confirmando o desenho de 7.15 e 7.16.** |
| **I** | 7.19 (+ regressão de D1) | Fechos | Docs, teste de regressão do refresh hash, suíte/typecheck/lint, fase ✅. |

### ✅ [Sessão A] Fase 7.0 — Fundação de infra
- ✅ Serviço `redis` (`redis:7-alpine`, healthcheck `redis-cli ping`) nos **três overrides**, não na base — os serviços de dado já viviam lá. Container/porta/volume próprios por ambiente: dev `6379` (volume `dev_redisdata`), **test `6380`** (sem volume — o teardown roda `down -v`), prod **sem porta publicada** (volume `prod_redisdata`). O `app` recebe `REDIS_URL: redis://redis:6379` pelo `environment` do override, mesmo idioma já usado na `DATABASE_URL`. `test:services:up` passou a subir `db redis`.
- ✅ `src/lib/redis.ts`: client ioredis com `enableOfflineQueue: false` + `maxRetriesPerRequest: 1` — **é isto que torna o fail-open (D2) real**; sem essas opções o comando ficaria enfileirado esperando reconexão e penduraria o login em vez de deixar o chamador seguir. `retryStrategy` com backoff limitado; listener de `error` só loga (o Redis nunca derruba o boot). `connectTimeout`/`commandTimeout` anotados como TODO da 7.13.
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
- ✅ Nota: o helper é pré-requisito da 7.11 (`DELETE /users/:id/lock`), que seria a quarta cópia.

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
- ✅ Nota: retenção/agregação fora da app é responsabilidade de infra/deploy (destinos na 7.9).

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

### ⬜ [Sessão C] Fase 7.6 — Audit log de ações sensíveis
- ⬜ Migration: model `AuditLog` (`id`, `actorId?`, `action`, `targetType`, `targetId?`, `metadata Json?`, `ip?`, `userAgent?`, `createdAt`); índices em `(createdAt, id)`, `action`, `actorId`, `targetId`.
- ⬜ Taxonomia `SCREAMING_SNAKE` (`USER_BANNED`), tabela canônica de ações em `docs/logging-policy.md` — nenhuma ação nasce fora da tabela.
- ⬜ `src/lib/auditLog.ts`: `record(action, { actorId?, targetType, targetId?, metadata?, tx? })`; `ip`/`userAgent`/`actorId` vêm do `AsyncLocalStorage` da 7.3, com **override explícito** para os casos sem request (scripts, seed, login falho antes de haver ator).
- ⬜ **Regra de PII:** `metadata` carrega **apenas ids e enums** — nunca email, nome ou qualquer PII. É o que habilita o demo a ler a trilha na 7.8, e evita que a trilha guarde um dado que mudou depois.
- ⬜ **Regra de transação:** ação que muda estado grava o audit na **mesma `$transaction`** (falhou o audit, desfaz a ação); evento sem transação (login falho, rate limit, lockout) grava direto, e a falha **não** derruba o request mas emite `error` no application log.
- ⬜ Append-only: sem update, sem delete pela aplicação (só o script de retenção da 7.14).
- ⬜ Chamado nos pontos: `AUTH_LOGIN_FAILED`, `AUTH_LOCKOUT_TRIGGERED`, `AUTH_LOCKOUT_CLEARED`, `AUTH_RATE_LIMIT_EXCEEDED`, `USER_CREATED`, `USER_DELETED`, `USER_BANNED`, `USER_UNBANNED`, `USER_ROLE_GRANTED`, `USER_ROLE_REVOKED`, `USER_PERMISSION_GRANTED`, `USER_PERMISSION_REVOKED`, `PASSWORD_RESET_REQUESTED`, `PASSWORD_RESET_COMPLETED`, `PASSWORD_CHANGED`, `PASSWORD_CHANGE_FORCED`, `EMAIL_CHANGE_REQUESTED`, `EMAIL_CHANGE_COMPLETED`.
- ⬜ Testes: cada ponto de chamada grava exatamente uma linha com o `action` certo; rollback da transação não deixa linha órfã; `metadata` sem PII (teste de contrato).

### ⬜ [Sessão D] Fase 7.7 — Paginação reutilizável (offset + cursor) + filtros em `GET /users`
> Movida para antes dos endpoints de leitura. A Fase 9 (domínio pet shop) depende deste helper. Racional completo no ADR `docs/adr/pagination.md`.

- ⬜ `src/lib/pagination.ts` oferecendo **as duas estratégias**; cada recurso escolhe a que fizer sentido.
- ⬜ **Offset** (padrão para listas de CRUD): schema Zod `?page=&limit=`, `limit` **default 20 / máximo 100** (constantes no helper, não env var — fazem parte do contrato documentado), envelope `{ data, meta: { page, limit, total } }`.
- ⬜ **Cursor/keyset** (para listas append-only ordenadas por tempo): chave composta `(campo_de_ordenação, id)` — **o tiebreaker por `id` é obrigatório**, senão registros com o mesmo timestamp são pulados ou repetidos; envelope `{ data, meta: { nextCursor, hasMore } }`; cursor opaco (base64 do par).
- ⬜ `GET /users` migra para offset + filtros `status`, `banned` (via `bannedAt`), `role`.
- ⬜ **D4 — envelope em todas as listagens** (breaking change assumido de uma vez): `/roles`, `/features`, `/auth/sessions`, `/users/:userId/roles`, `/users/:userId/features` passam a `{ data, meta }` mesmo sem paginar. **Exceção:** `GET /users/:userId/permissions` continua `string[]` (conjunto de capacidades computado, não coleção de recursos).
  - ⬜ Atualizar junto, na mesma feat-branch: presenters, `src/docs/paths/*`, coleção Bruno (`api-collection/`) e os testes de integração de cada rota.
- ⬜ Testes: `limit` acima do teto → **422** (não clamp silencioso); página vazia → `data: []` com 200 (lista vazia não é 404); **cursor com timestamps duplicados não pula nem repete** (teste de regressão do tiebreaker); cursor inválido/corrompido → 422.

### ⬜ [Sessão D] Fase 7.8 — Endpoints de leitura de log
- ⬜ Features novas em `feature.constants.ts` (D5, padrão `ação:recurso:modificador`, **singular** como o resto do catálogo): **`read:log`** (buffer em memória), **`read:audit-log`** (trilha durável, `ip` mascarado) e **`read:audit-log:full`** (destrava o `ip` inteiro).
  - ⬜ `role.constants.ts`: admin (via `*`) e manager recebem as três; a role **`demo`** recebe `read:log` e `read:audit-log` — **não** `:full`. Reseed + `db:generate`.
- ⬜ **`GET /audit-logs`** (`read:audit-log`): paginação **cursor** (7.7); filtros `action`, `actorId`, `targetType`, `targetId`, `from`, `to`.
  - ⬜ `ip` **mascarado** (`192.168.1.***`) para quem não tem `read:audit-log:full` — mesmo endpoint, resposta diferente por permissão (RBAC demonstrado dentro da própria resposta). Mascaramento na camada de serialização; o dado permanece íntegro no banco.
  - ⬜ Só `GET`. Teste explícito de que `PATCH`/`DELETE` não existem (imutabilidade intencional).
- ⬜ **`GET /logs/recent`** (`read:log`): ring buffer da 7.3, `?limit=` opcional, sem paginação (já é limitado por construção), mas **com o envelope** `{ data, meta }` (D4).
  - ⬜ `meta` explicitando a limitação: o buffer é **por processo** e **some no restart**.
- ⬜ Testes: 401 sem token; 403 sem a feature; demo lê os dois com 200; **demo recebe `ip` mascarado e ator com `:full` recebe inteiro** (mesma linha, duas respostas); filtros combinados.

### ⬜ [Sessão F] Fase 7.9 — Destinos externos: Axiom + Sentry
- ⬜ **Axiom** como transport do pino (`@axiomhq/pino`), em **worker thread** (`pino.transport`) — chamada remota nunca no caminho síncrono do request.
- ⬜ `flush` do transport no `shutdown.ts` (senão os últimos logs antes do SIGTERM se perdem — justamente quando mais importam).
- ⬜ Só ativa com `AXIOM_TOKEN`/`AXIOM_DATASET` presentes; ausente → degrada para stdout, **nunca** derruba o boot.
- ⬜ **Sentry** capturando apenas falha de verdade: `AppError` com status ≥ 500, erro não-tratado, `unhandledRejection`, `uncaughtException`. 4xx esperado (404/422/403) **não** vai pro Sentry — é comportamento, não falha.
- ⬜ `sendDefaultPii: false` + `beforeSend` scrubbando a mesma lista de campos proibidos da política (senão vaza pela porta dos fundos o que o `redact` protege).
- ⬜ `release`/`environment` setados, para agrupar por deploy.
- ⬜ Env vars novas: `AXIOM_TOKEN`, `AXIOM_DATASET`, `SENTRY_DSN`.

### ⬜ [Sessão E] Fase 7.10 — Rate limiting nas rotas de auth
> Valores e racional firmados no ADR `docs/adr/rate-limiting-and-lockout.md`.

- ⬜ `rate-limiter-flexible` com `RateLimiterRedis`.
- ⬜ Regras **por IP** (D8 — defaults por env var): `login` 20/15min (`RATE_LIMIT_LOGIN`); `signup` 5/1h (`RATE_LIMIT_SIGNUP`); `forgot-password` e `verify-email/resend` 5/1h (`RATE_LIMIT_EMAIL`).
- ⬜ Regras **por email destinatário** (`RATE_LIMIT_EMAIL_TARGET`, 5/1h — fecha o furo do atacante que rotaciona IP para bombardear a caixa de uma vítima específica e queimar a reputação do domínio remetente): `forgot-password` e `verify-email/resend` limitados também por email-alvo (mesmo Redis, namespace de chave diferente).
- ⬜ **Fail-open (D2):** Redis indisponível → o limitador é ignorado e o request segue, emitindo `error` no application log. Teste com o Redis derrubado: login continua 200.
- ⬜ Resposta 429 genérica (não revela qual regra disparou nem confirma existência de conta).
- ⬜ Excedido → `AUTH_RATE_LIMIT_EXCEEDED` no audit log + `warn` no application log.
- ⬜ Testes com o Redis real do ambiente de teste (serviço no override de test, 7.0); contador isolado por teste.

### ⬜ [Sessão E] Fase 7.11 — Account lockout + desbloqueio pelo admin
- ⬜ Contador de falhas por conta em Redis (D8, por env var): **`LOCKOUT_THRESHOLD` 5 falhas → `LOCKOUT_WINDOW_MS` 15min**, dobrando a cada ciclo seguinte até o teto `LOCKOUT_MAX_MS` (24h).
- ⬜ Reset completo (contador + nível de backoff) no login certo.
- ⬜ Checagem entra em `auth.service.login`, ao lado dos gates de `bannedAt`/`status`. **Fail-open (D2)** também aqui.
- ⬜ **`DELETE /users/:id/lock`** (`manage:user:status`; guarda de privilegiado reusando o helper da 7.2) — desbloqueia, reset completo, 204 sucesso, 409 se não estava travada; registra `AUTH_LOCKOUT_CLEARED`.
- ⬜ Lockout disparado → `AUTH_LOCKOUT_TRIGGERED` no audit log.
- ⬜ Sem lock manual pelo admin nesta fase (só o desbloqueio) — fora de escopo, registrado no `docs/backlog.md`.

### ✅ Fase 7.12 — Refresh token hasheado em repouso *(D1 — já implementado desde a Fase 3)*
> Item levantado na reformulação e resolvido na análise do planejamento, **sem código novo**: `Session.refreshTokenHash` já guarda `sha256(token)` (`src/lib/token.ts`, `hashToken`) desde a Fase 3 — o token opaco nunca foi persistido em plaintext. A comparação em tempo constante que o item pedia não se aplica: o lookup é `findUnique` pelo hash, não comparação byte a byte de segredo. Trocar sha256 por HMAC com `PEPPER` foi considerado e **recusado** (ganho marginal com token de 32 bytes de entropia; custo = migration invalidando todas as sessões) — registrado no `docs/backlog.md`.
>
> Resta apenas formalizar em teste de regressão, na **Sessão I** (7.19): a coluna nunca contém o token entregue ao cliente; token adulterado → 401.

### ⬜ [Sessão F] Fase 7.13 — Timeouts em tudo
> Sem timeout, uma dependência pendurada exaure o pool e derruba a app inteira — o modo de falha mais comum em prod e o menos exercitado em teste.

- ⬜ HTTP server: `server.requestTimeout`, `server.headersTimeout` (também mitiga slowloris), `server.keepAliveTimeout`.
- ⬜ Prisma: `transactionOptions` (`maxWait`, `timeout`) e timeout de pool na connection string.
- ⬜ Redis: `connectTimeout` + `commandTimeout` — sem eles o **fail-open (D2)** é ilusório, porque um Redis que aceita a conexão mas não responde penduraria o login pelo timeout de socket do SO.
- ⬜ **SMTP (nodemailer, `src/lib/email.ts`)**: `connectionTimeout`, `greetingTimeout` e `socketTimeout` no transporter — o envio é SMTP, não a API HTTP da Resend, então `AbortSignal.timeout` não se aplica. Falha/timeout vira `error` no application log sem quebrar o fluxo do usuário.
- ⬜ Valores por env com defaults conservadores; registrados no `docs/context.md`.

### ⬜ [Sessão G] Fase 7.14 — Teto de sessões vivas + faxina de registros mortos
- ⬜ Teto de sessões vivas simultâneas por usuário: **`MAX_LIVE_SESSIONS` 5** (D8); evict da mais antiga ao exceder (login nunca é recusado).
- ⬜ `src/scripts/cleanup-sessions.ts`: hard delete de `Session`/`VerificationToken` mortos há mais de `SESSION_RETENTION_DAYS` (default 30).
- ⬜ `src/scripts/cleanup-audit-log.ts`: hard delete de `AuditLog` acima de `AUDIT_LOG_RETENTION_DAYS` (**21 dias no demo, 365 em prod**) — **único** lugar autorizado a deletar audit log.
- ⬜ Ambos com `--dry-run` (conta e loga, não apaga), execução em transação, resultado (linhas por tabela + duração) no application log.
- ⬜ Rodados via `npm run` script, nunca dentro do ciclo request/response.

### ⬜ [Sessão H] Fase 7.15 — Troca de email *(desenho a confirmar no início da feature)*
- ⬜ Reabre a decisão de `user.schema.ts:56` (hoje bloqueada). Proposta a validar: endpoint próprio autenticado, senha atual exigida (como change-password), fluxo de 2 passos com verificação no email novo antes de efetivar (`pendingEmail` + `VerificationPurpose.EMAIL_CHANGE`).
- ⬜ Pontos a decidir na feature: notifica o email antigo da troca? o que acontece se o novo email já existe (conflito)? TTL do pending?
- ⬜ `EMAIL_CHANGE_REQUESTED` / `EMAIL_CHANGE_COMPLETED` no audit log (só ids — o email não entra em `metadata`).

### ⬜ [Sessão H] Fase 7.16 — Forçar troca de senha, ação do admin *(desenho a confirmar)*
- ⬜ Proposta: flag `mustChangePassword` no `User`; endpoint que a ativa + invalida sessões do alvo (feature a decidir na abertura da Sessão H — provável `manage:user:status`).
- ⬜ Ponto a decidir na feature: login com a flag ativa bloqueia acesso até trocar, ou deixa entrar sinalizando pro front forçar a troca?
- ⬜ `PASSWORD_CHANGE_FORCED` no audit log.

### ⬜ [Sessão H] Fase 7.17 — Polir `GET /auth/sessions`
- ⬜ Parsing de user-agent (ex. `ua-parser-js`) → `{ device: "Chrome no Windows", ipAddress, createdAt, current }`, marcando a sessão da request atual.

### ⬜ [Sessão G] Fase 7.18 — Reset do ambiente demo
> Higiene do deploy de portfólio. **Não** é o que garante o demo read-only — isso é RBAC (role `demo`, Fase 5). São duas defesas independentes: a autorização impede a escrita do usuário demo, a faxina limpa o que os outros usuários criaram.

- ⬜ `src/scripts/demo-reset.ts`: **truncate + reseed** (determinístico e não cresce a cada model novo da Fase 9 — ao contrário de "deletar o que não é seed", que exigiria um marcador em toda tabela).
- ⬜ Seed idempotente e reaproveitado (já bundlado em `dist/seed.js` desde a Fase 5).
- ⬜ **Guarda:** só executa com `DEMO_MODE=true` explícito. **Não** inferir de `NODE_ENV` — o deploy demo *é* production. Sem a flag: erro barulhento, exit ≠ 0, nada apagado.
- ⬜ `--dry-run` obrigatório antes do primeiro uso real; execução em transação.
- ⬜ Resultado no application log + `DEMO_RESET_EXECUTED` no audit log (contagem por tabela, duração).
- ⬜ Agendamento **diário** (não a cada 3 dias: evita que um recrutador encontre a bagunça do anterior) via **systemd timer** versionado em `infra/cron/` — preferido a cron por dar `journalctl`, `Persistent=` e proteção contra sobreposição.
  - ⬜ Corte de responsabilidade: **`src/scripts/`** = código (importa Prisma/`env`/`logger`, é bundlado pelo tsup); **`infra/`** = agendamento e como o container roda.
- ⬜ Horário publicado na doc/`/reference` ("ambiente demo resetado diariamente às 04:00 UTC") — transforma o logout inesperado em comportamento documentado.
- ⬜ Quando existir dummy data (Fase 9+), o reseed passa a restaurá-lo.

### ⬜ [Sessão I] Fase 7.19 — Fechos
- ⬜ **Teste de regressão do refresh hash (D1 / 7.12):** a coluna `Session.refreshTokenHash` nunca contém o token entregue ao cliente; refresh válido → 200; token adulterado → 401.
- ⬜ `docs/endpoints.md` atualizado com as rotas novas (`GET /audit-logs`, `GET /logs/recent`, `DELETE /users/:id/lock`, troca de email, forçar troca de senha) + as features novas (`read:log`, `read:audit-log`, `read:audit-log:full`) e o envelope `{ data, meta }` nas listagens (D4).
- ⬜ `docs/logging-policy.md` revisado com os valores efetivamente escolhidos em cada sub-fase.
- ⬜ `docs/context.md`: promover a §2.2 de "planejada" a "implementada", com as decisões confirmadas em cada sub-fase (inclusive 7.15/7.16, fechadas na Sessão H).
- ⬜ ADRs `rate-limiting-and-lockout.md` e `pagination.md`: revisar a seção "Quando revisitar" com o que a implementação de fato mostrou.
- ⬜ `docs/backlog.md` revisado (o que saiu do backlog, o que entrou).
- ⬜ `README.md`: mencionar o Redis como serviço novo e o horário do reset do demo.
- ⬜ `npm run typecheck` + `npm run lint` + suíte completa verdes; Fase 7 marcada ✅.

---

## Fases seguintes (resumo)
- **Fase 8 — Reativação de conta deletada (soft delete):** serviço para reativar contas que tenham sido deletada. Hoje quando acontece um delete de uma conta, a conta entra no soft delete o que prende o email e os dados que são unicos na tabela. Essa fase tem como objetivo permitir que usuarios que tenham deletado a sua conta recuperem a conta e atualizem para novos dados (usuario pode ter mudado email e etc) - um ponto de atenção é não recuperar perfis errados, ex: um usuario que era employee e customer, deixou de ser employee e teve a conta deletada, mas quer "criar" uma conta de customer (signup), teria o cpf preso na conta antigo, ele deve ser capaz de recuperar a conta, mas apenas customer - sem o perfil de employee que deve permanecer soft delete.
- **Fase 9 — Domínio pet shop:** model Pet (Customer 1:N), CRUD aninhado em customers, scopes own/others, views owner/staff.

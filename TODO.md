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

## Fase 4 — Email, status de conta e banimento ⬜

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

### ⬜ Fase 4.2 — Recuperação de senha (forgot/reset)
> **Firmado:** forgot sempre 200 genérico; reset invalida TODAS as sessões.

- ⬜ **POST /api/v1/auth/forgot-password** `{ email }` (público)
  - ⬜ Testes primeiro: **sempre 200 genérico**; email de reset só sai se a conta existe, é `ACTIVE` e não banida (`VerificationToken(PASSWORD_RESET)`, TTL **1h**); email inexistente/PENDING/banido → 200 sem enviar
  - ⬜ Schema + service + repository + controller + rota
- ⬜ **POST /api/v1/auth/reset-password** `{ token, newPassword }` (público)
  - ⬜ Testes primeiro: 422 body inválido; token inexistente/expirado/usado → erro genérico; sucesso → hash da senha nova salvo, token consome `usedAt`, **`invalidateAllUserSessions`** derruba as sessões; token single-use
  - ⬜ Schema + service (`$transaction`: nova senha + consome token + invalida sessões) + controller + rota
- ⬜ Suíte + `typecheck` verdes

### ⬜ Fase 4.3 — Troca de senha (logado)
> **Firmado:** single-step, sem email/código. Exige só a senha atual. Invalida TODAS as sessões (o usuário reloga).

- ⬜ **POST /api/v1/auth/change-password** `{ currentPassword, newPassword }` (só `authenticate`, sem `canAccess`)
  - ⬜ Testes primeiro: 401 sem access token; senha atual errada → 401/403 (decidir na escrita, coerente com o login); 422 `newPassword` inválida; sucesso → hash novo salvo + **`invalidateAllUserSessions`** (todas as sessões, inclusive a atual — o usuário reloga)
  - ⬜ Schema `changePasswordSchema` + service (verifica `currentPassword` via bcrypt → troca → invalida sessões) + controller (`getAuthUser`) + rota com `authenticate`
- ⬜ Suíte + `typecheck` verdes

### ⬜ Fase 4.4 — Banimento (ban/unban)
> **Firmado:** `POST`/`DELETE /users/:id/ban`; feature `manage:user:status` (manager+admin); proteção de privilegiado (banir/desbanir alvo com `PERMISSION_FEATURES`/`*` exige role admin); banido = conta congelada (login, forgot/reset e resend bloqueados; sessões derrubadas). Audit `bannedAt`+`bannedBy`+`banReason` (reason obrigatório).

- ⬜ **POST /api/v1/users/:id/ban** `{ reason }` (`manage:user:status`)
  - ⬜ Testes primeiro: 401 sem token; 403 sem `manage:user:status`; 422 `:id` inválido / `reason` ausente; 404 user inexistente (autorização antes da busca, não vaza); **403 ator não-admin bane alvo privilegiado** (role com `PERMISSION_FEATURES`/`*`); 409 se já banido; 204/200 bane com sucesso → `bannedAt`/`bannedBy = ator`/`banReason` setados + **sessões do alvo invalidadas**
  - ⬜ Schema + service (`assertAdminForBan` reusando o padrão de `assertAdminForRoleAssignment`; 409 se já banido; `$transaction`: seta ban + `invalidateAllUserSessions`) + repository + controller + rota
- ⬜ **DELETE /api/v1/users/:id/ban** (`manage:user:status`)
  - ⬜ Testes primeiro: mesmos guards (401/403/422/404); **403 ator não-admin desbane alvo privilegiado**; 409 se não estava banido; 204 desbane → limpa `bannedAt`/`bannedBy`/`banReason`, `status` preservado
  - ⬜ Service + repository + controller + rota
- ⬜ **Efeito conta-congelada** (estender guards já criados):
  - ⬜ Login de banido → 403 msg de suporte (gate da Fase 4.1 já checa `bannedAt`; adicionar teste)
  - ⬜ `forgot-password` e `verify-email/resend` de banido → 200 genérico mas **nenhum email sai** (adicionar checagem `!banned` + testes)
- ⬜ Decidir status de resposta do ban (204 vs 200 com recurso) na escrita — coerente com o padrão do projeto (DELETE de user = 204)
- ⬜ Suíte + `typecheck` verdes

### ⬜ Fase 4.5 — Fechos
- ⬜ Atualizar `ENDPOINTS.md` com as rotas novas (`/auth/verify-email`, `/auth/verify-email/resend`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/change-password`, `POST`/`DELETE /users/:id/ban`) + a nova feature `manage:user:status`
- ⬜ `CONTEXT.md`: consolidar o racional (status ortogonal ao ban, anti-enumeração no forgot/resend/signup, invalidação de sessão em reset/change/ban, design do `VerificationToken` genérico, gate de login 403) — já esboçado na seção "Fase 4 (planejada)", promover a "fechada"
- ⬜ **Bug pré-existente (achado na condensação das Fases 2/3):** `user.service.getUserById` (`src/modules/user/user.service.ts:52-70`) faz a busca ANTES da autorização (404 antes de 403), contrariando a regra "autorização antes da busca / 403 vence 404" — vaza existência de id em `GET /users/:id` para ator sem `read:user:others`. Inverter a ordem (checar `canActOnResource` antes do `findUserById`), espelhando `updateUser`/`deleteUser`; adicionar teste de regressão (403 igual para id existente e inexistente).
- ⬜ `npm run typecheck` + `npm run lint` + `npm run test:run` limpos; marcar Fase 4 ✅

---

## Fases seguintes (resumo)
- **Fase 5 — Hardening:** rate limiting, account lockout. (Revisitar proteção de escalação se precisar de algo além do admin-only.)
- **Fase 6 — Domínio pet shop:** model Pet (Customer 1:N), CRUD aninhado em customers, scopes own/others, views owner/staff.

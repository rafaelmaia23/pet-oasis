# pet-oasis — TODO (Ciclo 1)

> Estado e ordem das tarefas. Consulte antes de começar; atualize ao concluir.
> Detalhes de decisões em `CONTEXT.md`. Regras de negócio firmadas no `CLAUDE.md`.

## Legenda
✅ feito · 🔄 em andamento · ⬜ a fazer · 🔸 polimento (não bloqueia)

---

## Fase 2 — Autorização e perfis (ATUAL)

### ✅ Fundação de autorização
- ✅ `computeEffectiveFeatures` (pura) + `can`/`hasFeature`/`canActOnResource` (Set, wildcard) + suítes unitárias
- ✅ `getUserForFeatureComputation` + middleware `authenticate` + `AuthUser` unificado (index.d.ts via `declare global`)
- ✅ Autorização-antes-da-busca (403 vence 404 por `targetId`, sem vazar existência)

### ✅ CRUD de user (modelo de perfis)
- ✅ `createCustomer`/`createEmployee` (nested write atômico) + tipos compostos (`CreateUserBase & {}`)
- ✅ `validateRoles(roleNames, ProfileKind)` compartilhada (appliesTo → 422 com `errors`)
- ✅ P2002 → 409 no handler (`meta.driverAdapterError.cause.constraint.fields` + labels PT)
- ✅ Helpers: `make*Data`, `buildCustomer`/`buildEmployee`, `buildAuthUserData`, `makePassword`, `clearDatabase`
- ✅ POST / GET lista / GET :id / PATCH / DELETE — todos testados
- ✅ **Soft delete de user**: `deletedAt`, filtros em todas as leituras, `softDeleteUserAndInvalidateSessions` (`$transaction`)

### ✅ Módulo role (read-only)
- ✅ `GET /roles` + `GET /roles/:id` (feature `read:role`)
- 🔸 extrair `toRoleDTO` (duplicação getAll/getById no service)

### ✅ Módulo permission — overrides
- ✅ `PUT /users/:userId/features/:featureId` (grant/deny, body `{ granted }`)
- ✅ `DELETE /users/:userId/features/:featureId` (remove override; 404 se não há — decidido: avisar, não 204 silencioso)
- ✅ Não-escalação: mexer em PERMISSION_FEATURES via override exige role **admin** (`assertAdminForPermissionFeature`, reusado no PUT e DELETE)
- 🔸 `z.guid` → `z.uuid` (grep geral)

### ✅ Soft delete de UserFeature e UserRole (auditoria)
- ✅ `id` próprio como PK (não par composto) + `deletedAt` nos dois models
- ✅ Unicidade do ativo controlada por código (busca ativo → update ou create; sem `upsert` por chave composta)
- ✅ Filtro `deletedAt: null` em `getUserForFeatureComputation`, `userInclude`, e queries de override
- ✅ Testes de regressão: cômputo ignora override deletado; re-grant após delete (histórico + 1 ativo)

### ✅ Endpoints de perfil (`user.profile.*` dentro do módulo user)
- ✅ `POST /users/:id/customer` (cria Customer + role customer; 409 ativo/inativo distintos; feature `create:profile`)
- ✅ `POST /users/:id/employee` (cria Employee + roles; default attendant; valida appliesTo via `validateRoles`; 409 ativo/inativo)
- ✅ Schema: `deletedAt` em Customer/Employee + migration
- ✅ `DELETE /users/:id/customer` (`$transaction`: soft-delete Customer + UserRoles com appliesTo CUSTOMER; recusa se único perfil ativo; 204)
- ✅ `DELETE /users/:id/employee` (espelha o customer; soft-delete Employee + UserRoles com appliesTo EMPLOYEE; recusa se único perfil ativo; 204)
- ✅ `delete:profile` adicionada a `USER_ADMINISTRATION_FEATURES` (manager tem a feature; seed sincronizado)
- 🔸 Refatorar testes de POST /customer e POST /employee que manipulam banco diretamente para usar os DELETEs reais (agora que existem)

### ⬜ Vínculo user↔role (GET/POST/DELETE) — módulo permission
> Mora em `src/modules/permission/` (route, controller, service, repository, schema), ao lado dos overrides de feature. GET não estava previsto originalmente — lista as roles ativas (efetivas) do usuário.
> Não-escalação generalizada: `assertAdminForRoleAssignment(requestingUserId, role)` — bloqueia ator não-admin se a role carrega alguma `PERMISSION_FEATURES` ou a feature wildcard `"*"` (cobre a role `admin` e qualquer role futura com esse perfil). Vale tanto pra conceder quanto pra revogar.

- ✅ Extrair `toRoleDTO` de `role.service.ts` (mapeia Role+features do Prisma pro shape `{id,name,description,appliesTo,features}`) e reusar em `getAllRoles`/`getRoleById` — resolve a dívida 🔸 já anotada e habilita reuso no GET de roles do usuário e no POST

- ✅ **GET /api/v1/users/:userId/roles** (feature `read:permission`)
  - ✅ Testes de integração: 401 sem token; 403 sem `read:permission`; 422 userId inválido; 404 user não encontrado; 200 lista as roles ativas do próprio usuário; 200 lista as roles ativas de outro usuário (ator com `read:permission`); shape da view = `rolePresenter`/`toRoleDTO`
  - ✅ Rodar suíte e confirmar falha (rota inexistente)
  - ✅ Schema `getUserRolesParamsSchema` em `permission.schema.ts`
  - ✅ Repository `getUserRoles(userId)` em `permission.repository.ts` (`userRole.findMany` com `userId, deletedAt: null`, include `role` com features)
  - ✅ Service `getUserRoles(userId)` em `permission.service.ts` (404 se user não existe, mapeia com `toRoleDTO`)
  - ✅ Controller + rota `GET /roles` (`canAccess("read:permission")`) em `permission.controller.ts`/`permission.routes.ts`, respondendo com `rolePresenter.presentMany`
  - ✅ Rodar suíte e confirmar verde

- ⬜ **POST /api/v1/users/:userId/roles/:roleId** (feature `manage:permission`)
  - ⬜ Testes de integração: 401 sem token; 403 sem `manage:permission`; 422 userId/roleId inválidos; 404 role não encontrada; 404 user não encontrado; 422 se `role.appliesTo` incompatível com os perfis ativos do user (action orienta a criar o perfil primeiro — NÃO cria perfil); 409 se o user já possui a role ativa; 403 se ator sem role admin tenta conceder uma role privilegiada (`PERMISSION_FEATURES`/wildcard, ex.: `admin`) mesmo tendo `manage:permission`; 201 admin concede role privilegiada; 201 concessão de role não-privilegiada por ator que só tem `manage:permission`
  - ⬜ Rodar suíte e confirmar falha
  - ⬜ Schema `postUserRoleParamsSchema` (sem body) em `permission.schema.ts`
  - ⬜ Service: `assertAdminForRoleAssignment(requestingUserId, role)` (checa `role.features` contra `PERMISSION_FEATURES ∪ "*"`) + `addUserRole(requestingUserId, targetUserId, roleId)` — busca role (404) → checa não-escalação (403) → busca user (404) → valida perfil compatível com `role.appliesTo` (422) → valida idempotência via `user.roles` já carregado (409) → delega ao repository
  - ⬜ Repository `addUserRole(userId, roleId)` em `permission.repository.ts` (`userRole.create`, include `role` com features)
  - ⬜ Controller + rota `POST /roles/:roleId` (`canAccess("manage:permission")`) — responde 201 com `rolePresenter`
  - ⬜ Rodar suíte e confirmar verde

- ⬜ **DELETE /api/v1/users/:userId/roles/:roleId** (feature `manage:permission`)
  - ⬜ Testes de integração: 401 sem token; 403 sem `manage:permission`; 422 userId/roleId inválidos; 404 role não encontrada; 404 user não possui essa role ativa; 403 se ator sem role admin tenta revogar role privilegiada; 409 se for a última role ativa do perfil correspondente (`action` aponta pro DELETE do perfil certo — customer ou employee); 204 remove role não-privilegiada com sucesso (mantendo as demais); 204 admin remove role privilegiada com sucesso
  - ⬜ Rodar suíte e confirmar falha
  - ⬜ Schema `deleteUserRoleParamsSchema` em `permission.schema.ts`
  - ⬜ Service `removeUserRole(requestingUserId, targetUserId, roleId)` — busca role (404) → `assertAdminForRoleAssignment` (403) → busca user (404) → localiza UserRole ativo em `user.roles` (404 se não tiver) → se `role.appliesTo` não for null, conta as demais roles ativas do user com o mesmo `appliesTo` (excluindo a atual) e bloqueia com 409 se for zero
  - ⬜ Repository `removeUserRole(userRoleId)` em `permission.repository.ts` (soft delete — espelha `removeUserFeature`)
  - ⬜ Controller + rota `DELETE /roles/:roleId` (`canAccess("manage:permission")`) — responde 204
  - ⬜ Rodar suíte e confirmar verde

- ⬜ Atualizar CONTEXT.md com o racional da não-escalação generalizada (por que cobre roles, não só overrides)

### ⬜ Permissions efetivas + me
- ⬜ `GET /users/:userId/permissions` (efetivas, reusa `computeEffectiveFeatures`)
- ⬜ `GET /api/v1/me` (view `me` com features efetivas)

### ⬜ Fechos pendentes
- ⬜ signup usa `createCustomer` (auth.service ainda no modelo antigo — remover createUser comentado)
- ⬜ Refatorar `auth.test.ts` para helpers novos (arquivo inteiro ainda no padrão antigo)
- 🔸 grep geral `z.guid` → `z.uuid`

> **Testes refatorados p/ helpers novos:** user, role, feature, status, permission, profile (customer+employee CRUD+DELETE), units (password, authorization) ✅ · **Falta:** auth

---

## Dívidas técnicas (resolver na Fase 3)
- Middleware `authenticate` usa `res.json` cru em vez de AppError + handler — padronizar no refactor de auth
- Aprender/aplicar erro async em middleware Express (next(error)/asyncHandler)
- Middleware sem teste unitário (coberto por integração; reavaliar se crescer)

---

## Fases seguintes (resumo)
- **Fase 3 — Auth alvo:** access JWT 15min validado localmente + refresh opaco rotativo com detecção de roubo; Session reshape (refreshToken/userAgent/ip/usedAt); cookie httpOnly; GET/DELETE `/auth/sessions`.
- **Fase 4 — Email + status:** nodemailer; status PENDING/ACTIVE/BANNED + EmailVerificationToken + activate; bloquear login não-ACTIVE; PasswordResetToken (forgot/reset); change-password. (É aqui que o soft delete ganha peso — vendas se ligam a customer.)
- **Fase 5 — Hardening:** rate limiting, account lockout. (Revisitar proteção de escalação se precisar de algo além do admin-only.)
- **Fase 6 — Domínio pet shop:** model Pet (Customer 1:N), CRUD aninhado em customers, scopes own/others, views owner/staff.

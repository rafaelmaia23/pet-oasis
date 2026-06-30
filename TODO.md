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

### ⬜ Vínculo user↔role (POST/DELETE) — DEPOIS dos perfis
- ⬜ `POST /users/:id/roles/:roleId` (feature `manage:permission`)
  - Pré-condição: user tem perfil compatível com `role.appliesTo` (senão 422 "crie o perfil primeiro" — NÃO cria perfil)
  - Idempotência: role ativa já atribuída → 409 (não deixar virar 500)
- ⬜ `DELETE /users/:id/roles/:roleId` — recusa se deixaria algum perfil sem role (última role do perfil sai via DELETE do perfil)
- ⬜ Decidir onde mora (módulo permission ou user)

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

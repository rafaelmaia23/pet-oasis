# pet-oasis — Endpoints

> Índice interno das rotas existentes (1 linha por rota). O contrato formal da API é o `GET /openapi.json` (OpenAPI 3.1) + a UI interativa em `GET /reference`; este arquivo é só o índice enxuto para organização enquanto o projeto cresce.
> Ao adicionar/alterar rotas, atualize aqui. Detalhe de decisões no `docs/context.md`.

## Mounting

As rotas de negócio ficam sob **`/api/v1`** (`src/routes/index.ts`). `authenticate` é aplicado **por grupo de rota**, não global:

- **Públicas** (sem `authenticate`): `/status`, `/auth`.
- **Protegidas** (`authenticate` no mount): `/me`, `/users`, `/users/:userId` (profile + permission), `/features`, `/roles`, `/audit-logs`, `/logs`.
- Exceção: 3 rotas dentro de `/auth` (público) aplicam `authenticate` **inline** na própria definição (`logout`, `GET /sessions`, `DELETE /sessions/:id`).

As rotas de **documentação** (`/openapi.json`, `/reference`) ficam no router de topo, **fora** de `/api/v1` e de `authenticate` — são públicas.

Coluna **Auth**: `público` = sem token; `authenticate` = só exige estar logado; `feature` = exige a feature via `canAccess(...)`.

**Envelope de listagem (Fase 7.7 / D4):** toda rota de **lista** devolve `{ data, meta }` — `meta { page, limit, total }` no offset (`GET /users`), `meta { nextCursor, hasMore }` no cursor (`GET /audit-logs`), `meta {}` nas que não paginam. Exceção: `GET /users/:userId/permissions` segue `string[]` cru.

---

## Docs — `src/routes/index.ts` (router de topo)

| Método + Path | Auth | Descrição |
|---|---|---|
| GET `/openapi.json` | público | Spec OpenAPI 3.1 gerada dos schemas Zod |
| GET `/reference` | público | UI Scalar — referência interativa da API |

---

## Status — `src/modules/status/status.routes.ts`

| Método + Path | Auth | Descrição |
|---|---|---|
| GET `/api/v1/status` | público | Health check da API |

## Auth — `src/modules/auth/auth.routes.ts`

| Método + Path | Auth | Descrição |
|---|---|---|
| POST `/api/v1/auth/signup` | público | Auto-cadastro; cria um usuário (customer), 201. Email de conta soft-deletada com o **cpf batendo** → dispara reativação e responde **202** genérico (nada é criado); cpf não batendo, conta banida ou conta ativa → 409 genérico |
| POST `/api/v1/auth/login` | público | Autentica; seta cookie httpOnly de refresh, retorna access token |
| POST `/api/v1/auth/refresh` | público (usa cookie de refresh) | Rotaciona o refresh e emite novo access token |
| POST `/api/v1/auth/logout` | `manage:session` | Revoga a sessão do cookie de refresh, limpa o cookie |
| GET `/api/v1/auth/sessions` | `read:session` | Lista as sessões vivas do próprio usuário |
| DELETE `/api/v1/auth/sessions/:id` | `manage:session` | Revoga uma sessão específica do próprio usuário |
| POST `/api/v1/auth/verify-email` | público | Verifica o email via token e ativa a conta (`ACTIVE`), 204 |
| POST `/api/v1/auth/verify-email/resend` | público | Reenvia o email de verificação (sempre 200 genérico) |
| POST `/api/v1/auth/forgot-password` | público | Dispara email de reset de senha (sempre 200 genérico) |
| POST `/api/v1/auth/reset-password` | público | Troca a senha via token e invalida TODAS as sessões, 204 |
| POST `/api/v1/auth/change-password` | `authenticate` | Troca a senha logado (exige senha atual) e invalida TODAS as sessões, 204 |
| POST `/api/v1/auth/change-email` | `update:user` | Pede a troca de email (exige senha atual); dispara aviso de segurança pro email antigo com o link de confirmação |
| POST `/api/v1/auth/confirm-email-change` | público | Confirma a troca via token, grava o email antigo em `PreviousEmail` (reservado para sempre), 204 |
| POST `/api/v1/auth/confirm-account-reactivation` | público | Reativa a conta via token e define **senha nova** (obrigatória); restaura os perfis escolhidos e as roles que morreram com eles — overrides nunca voltam (D6'). `phone` só é exigido quando o perfil de cliente precisa nascer do zero. 204 |

## Me — `src/modules/me/me.routes.ts`

| Método + Path | Auth | Descrição |
|---|---|---|
| GET `/api/v1/me` | `read:user` | Perfil do usuário autenticado + features efetivas |

## User — `src/modules/user/user.routes.ts`

| Método + Path | Auth | Descrição |
|---|---|---|
| POST `/api/v1/users` | `create:user` | Cria um usuário employee |
| GET `/api/v1/users` | `read:user:others` | Lista usuários (offset `?page=&limit=` + filtros `status`/`banned`/`role`) |
| GET `/api/v1/users/:id` | `read:user` | Busca um usuário por id |
| PATCH `/api/v1/users/:id` | `update:user` | Atualiza um usuário |
| DELETE `/api/v1/users/:id` | `delete:user` | Soft delete do usuário + invalida sessões |
| POST `/api/v1/users/:id/ban` | `manage:user:status` | Bane o usuário (`bannedAt`/`bannedBy`/`banReason`) + invalida sessões, 204 |
| DELETE `/api/v1/users/:id/ban` | `manage:user:status` | Desbane o usuário (limpa colunas de ban, preserva `status`), 204 |
| DELETE `/api/v1/users/:id/lock` | `manage:user:status` | Desbloqueia a conta travada por lockout, reset completo do contador, 204 |
| POST `/api/v1/users/:id/force-password-reset` | `manage:user:status` | Força troca de senha (bloqueia login até o reset), invalida sessões + envia email de reset, 204 |

## User profile — `src/modules/user/profile/user.profile.routes.ts`

| Método + Path | Auth | Descrição |
|---|---|---|
| POST `/api/v1/users/:userId/customer` | `create:customer-profile` **ou** `reactivate:customer-profile` (self ou `:others`) | Cria **ou** reativa o perfil customer, 201 nos dois casos |
| POST `/api/v1/users/:userId/employee` | `create:employee-profile` **ou** `reactivate:employee-profile` | Cria **ou** reativa o perfil employee, 201 nos dois casos |
| DELETE `/api/v1/users/:userId/customer` | `delete:profile` | Soft delete do perfil customer + roles CUSTOMER + overrides delas |
| DELETE `/api/v1/users/:userId/employee` | `delete:profile` | Soft delete do perfil employee + roles EMPLOYEE + overrides delas |

**Criar ou reativar na mesma rota (Fase 8.3):** o ramo sai do estado do perfil no banco,
não do verbo — perfil ausente cria, perfil soft-deletado reativa, perfil ativo é **409**.
A resposta é **201** nos dois ramos: o cliente não precisa saber que a linha foi revivida.

A autorização é em duas etapas. A rota declara as duas features e admite quem tiver
qualquer uma delas; o service reconfere a específica do ramo que de fato correu — sem
isso, ter só `reactivate:` deixaria criar do zero. A checagem de autorização acontece
**antes** da busca do usuário (403 vence 404).

| Quem | Perfil de cliente | Perfil de funcionário |
|---|---|---|
| O próprio usuário | ✅ criar e reativar (baseline de todo autenticado) | ❌ nunca — não há self-service para virar funcionário |
| `attendant` | ✅ criar e reativar o de outro | ❌ |
| `manager` / `admin` | ✅ | ✅ |

O `phone` do body **atualiza** o perfil na reativação — o `POST` é o único caminho que
grava `Customer.phone` (o `PATCH /users/:id` só aceita `name`).

O `roleNames` do `POST .../employee` é a lista de roles com que o perfil **nasce ou
volta**. Cada nome é restaurado (se morreu naquela cascata) ou concedido (se morreu
noutro instante, ou nunca existiu); o que não for nomeado fica para trás. Omitido, volta
tudo o que morreu na cascata. Conceder role por aqui responde ao mesmo guard de
não-escalação de `POST /users/:id/roles/:roleId` → **403** se um não-admin nomear uma role
privilegiada. Os overrides das roles restauradas **não** voltam (ver o bloco de escopo do
override, acima).

## Permission — `src/modules/permission/permission.routes.ts` (montado em `/users/:userId`)

| Método + Path | Auth | Descrição |
|---|---|---|
| GET `/api/v1/users/:userId/features` | `read:permission` | Lista os overrides de feature do usuário, cada um com a role a que pertence |
| GET `/api/v1/users/:userId/roles` | `read:permission` | Lista as roles ativas do usuário |
| GET `/api/v1/users/:userId/permissions` | `read:permission` | Lista as features efetivas do usuário |
| POST `/api/v1/users/:userId/roles/:roleId` | `manage:permission` | Concede uma role ao usuário (reusa a linha se já houve; restaura os overrides dela) |
| DELETE `/api/v1/users/:userId/roles/:roleId` | `manage:permission` | Revoga uma role do usuário (cascateia para os overrides dela) |
| PUT `/api/v1/users/:userId/roles/:roleId/features/:featureId` | `manage:permission` | Cria/atualiza um override de feature (grant/deny) numa role do usuário |
| DELETE `/api/v1/users/:userId/roles/:roleId/features/:featureId` | `manage:permission` | Remove um override de feature |

**Escopo do override (Fase 8.0, D2/D9):** um override pertence a uma **atribuição de
role**, não ao usuário solto — por isso a role vai no path. Sem a role ativa, o `PUT`
responde **422** (`errors.roleId`); o `DELETE` responde **404** para a tripla inteira, sem
revelar se o usuário tem aquela role.

**Revogar a role mata os overrides pendurados nela — e re-concedê-la não os traz de volta**
(D6', Fase 8 Sessão C). A cascata de deleção desce quatro níveis; a restauração para na
`UserRole`. Quem devolve um cargo frequentemente não sabe que havia ajuste fino pendurado
nele, então override só volta por `PUT` explícito, que revive a linha soft-deletada.

## Feature — `src/modules/feature/feature.routes.ts`

| Método + Path | Auth | Descrição |
|---|---|---|
| GET `/api/v1/features` | `read:feature` | Lista todas as features |
| GET `/api/v1/features/:id` | `read:feature` | Busca uma feature por id |

## Role — `src/modules/role/role.routes.ts`

| Método + Path | Auth | Descrição |
|---|---|---|
| GET `/api/v1/roles` | `read:role` | Lista todas as roles |
| GET `/api/v1/roles/:id` | `read:role` | Busca uma role por id |

## Audit log — `src/modules/audit-log/audit-log.routes.ts`

| Método + Path | Auth | Descrição |
|---|---|---|
| GET `/api/v1/audit-logs` | `read:audit-log` | Trilha de auditoria (cursor; filtros `action`/`actorId`/`targetType`/`targetId`/`from`/`to`); `ip` mascarado sem `read:audit-log:full`. Só GET (append-only) |

## Log — `src/modules/log/log.routes.ts`

| Método + Path | Auth | Descrição |
|---|---|---|
| GET `/api/v1/logs/recent` | `read:log` | Linhas recentes do ring buffer em memória (`?limit=`; mais novas primeiro; `meta` declara por-processo/volátil) |

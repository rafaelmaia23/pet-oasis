# pet-oasis — Endpoints

> Índice interno das rotas existentes (1 linha por rota). O contrato formal da API é o `GET /openapi.json` (OpenAPI 3.1) + a UI interativa em `GET /reference`; este arquivo é só o índice enxuto para organização enquanto o projeto cresce.
> Ao adicionar/alterar rotas, atualize aqui. Detalhe de decisões no `docs/context.md`.

## Mounting

As rotas de negócio ficam sob **`/api/v1`** (`src/routes/index.ts`). `authenticate` é aplicado **por grupo de rota**, não global:

- **Públicas** (sem `authenticate`): `/status`, `/auth`.
- **Protegidas** (`authenticate` no mount): `/me`, `/users`, `/users/:userId` (profile + permission), `/features`, `/roles`.
- Exceção: 3 rotas dentro de `/auth` (público) aplicam `authenticate` **inline** na própria definição (`logout`, `GET /sessions`, `DELETE /sessions/:id`).

As rotas de **documentação** (`/openapi.json`, `/reference`) ficam no router de topo, **fora** de `/api/v1` e de `authenticate` — são públicas.

Coluna **Auth**: `público` = sem token; `authenticate` = só exige estar logado; `feature` = exige a feature via `canAccess(...)`.

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
| POST `/api/v1/auth/signup` | público | Auto-cadastro; cria um usuário (customer), 201 |
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

## Me — `src/modules/me/me.routes.ts`

| Método + Path | Auth | Descrição |
|---|---|---|
| GET `/api/v1/me` | `read:user` | Perfil do usuário autenticado + features efetivas |

## User — `src/modules/user/user.routes.ts`

| Método + Path | Auth | Descrição |
|---|---|---|
| POST `/api/v1/users` | `create:user` | Cria um usuário employee |
| GET `/api/v1/users` | `read:user:others` | Lista todos os usuários |
| GET `/api/v1/users/:id` | `read:user` | Busca um usuário por id |
| PATCH `/api/v1/users/:id` | `update:user` | Atualiza um usuário |
| DELETE `/api/v1/users/:id` | `delete:user` | Soft delete do usuário + invalida sessões |
| POST `/api/v1/users/:id/ban` | `manage:user:status` | Bane o usuário (`bannedAt`/`bannedBy`/`banReason`) + invalida sessões, 204 |
| DELETE `/api/v1/users/:id/ban` | `manage:user:status` | Desbane o usuário (limpa colunas de ban, preserva `status`), 204 |

## User profile — `src/modules/user/profile/user.profile.routes.ts`

| Método + Path | Auth | Descrição |
|---|---|---|
| POST `/api/v1/users/:userId/customer` | `create:profile` | Cria o perfil customer do usuário |
| POST `/api/v1/users/:userId/employee` | `create:profile` | Cria o perfil employee do usuário |
| DELETE `/api/v1/users/:userId/customer` | `delete:profile` | Soft delete do perfil customer + roles CUSTOMER |
| DELETE `/api/v1/users/:userId/employee` | `delete:profile` | Soft delete do perfil employee + roles EMPLOYEE |

## Permission — `src/modules/permission/permission.routes.ts` (montado em `/users/:userId`)

| Método + Path | Auth | Descrição |
|---|---|---|
| GET `/api/v1/users/:userId/features` | `read:permission` | Lista os overrides de feature do usuário |
| GET `/api/v1/users/:userId/roles` | `read:permission` | Lista as roles ativas do usuário |
| GET `/api/v1/users/:userId/permissions` | `read:permission` | Lista as features efetivas do usuário |
| POST `/api/v1/users/:userId/roles/:roleId` | `manage:permission` | Concede uma role ao usuário |
| DELETE `/api/v1/users/:userId/roles/:roleId` | `manage:permission` | Revoga uma role do usuário |
| PUT `/api/v1/users/:userId/features/:featureId` | `manage:permission` | Cria/atualiza um override de feature (grant/deny) |
| DELETE `/api/v1/users/:userId/features/:featureId` | `manage:permission` | Remove um override de feature |

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

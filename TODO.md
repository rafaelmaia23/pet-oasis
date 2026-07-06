# pet-oasis — TODO (Ciclo 1)

> Estado e ordem das tarefas. Consulte antes de começar; atualize ao concluir.
> Detalhes de decisões em `CONTEXT.md`. Regras de negócio firmadas no `CLAUDE.md`.

## Legenda
✅ feito · 🔄 em andamento · ⬜ a fazer · 🔸 polimento (não bloqueia)

---

## Fase 2 — Autorização e perfis ✅

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

### ✅ Módulo permission — overrides
- ✅ `PUT /users/:userId/features/:featureId` (grant/deny, body `{ granted }`)
- ✅ `DELETE /users/:userId/features/:featureId` (remove override; 404 se não há — decidido: avisar, não 204 silencioso)
- ✅ Não-escalação: mexer em PERMISSION_FEATURES via override exige role **admin** (`assertAdminForPermissionFeature`, reusado no PUT e DELETE)

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
- ✅ Testes de POST /customer e POST /employee refatorados para usar os DELETEs reais em vez de manipular o banco direto via Prisma

### ✅ Vínculo user↔role (GET/POST/DELETE) — módulo permission
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

- ✅ **POST /api/v1/users/:userId/roles/:roleId** (feature `manage:permission`)
  - ✅ Testes de integração: 401 sem token; 403 sem `manage:permission`; 422 userId/roleId inválidos; 404 role não encontrada; 404 user não encontrado; 422 se `role.appliesTo` incompatível com os perfis ativos do user (action orienta a criar o perfil primeiro — NÃO cria perfil); 409 se o user já possui a role ativa; 403 se ator sem role admin tenta conceder uma role privilegiada (`PERMISSION_FEATURES`/wildcard, ex.: `admin`) mesmo tendo `manage:permission`; 201 admin concede role privilegiada; 201 concessão de role não-privilegiada por ator que só tem `manage:permission`
  - ✅ Rodar suíte e confirmar falha
  - ✅ Schema `postUserRoleParamsSchema` (sem body) em `permission.schema.ts`
  - ✅ Service: `assertAdminForRoleAssignment(requestingUserId, role)` (checa `role.features` contra `PERMISSION_FEATURES ∪ "*"`) + `addUserRole(requestingUserId, targetUserId, roleId)` — busca role (404) → checa não-escalação (403) → busca user (404) → valida perfil compatível com `role.appliesTo` (422) → valida idempotência via `user.roles` já carregado (409) → delega ao repository
  - ✅ Repository `addUserRole(userId, roleId)` em `permission.repository.ts` (`userRole.create`, include `role` com features)
  - ✅ Controller + rota `POST /roles/:roleId` (`canAccess("manage:permission")`) — responde 201 com `rolePresenter`
  - ✅ Rodar suíte e confirmar verde

- ✅ **DELETE /api/v1/users/:userId/roles/:roleId** (feature `manage:permission`)
  - ✅ Testes de integração: 401 sem token; 403 sem `manage:permission`; 422 userId/roleId inválidos; 404 role não encontrada; 404 user não possui essa role ativa; 403 se ator sem role admin tenta revogar role privilegiada; 409 se for a última role ativa do perfil correspondente (`action` aponta pro DELETE do perfil certo — customer ou employee); 204 remove role não-privilegiada com sucesso (mantendo as demais); 204 admin remove role privilegiada com sucesso
  - ✅ Rodar suíte e confirmar falha
  - ✅ Schema `deleteUserRoleParamsSchema` em `permission.schema.ts`
  - ✅ Service `removeUserRole(requestingUserId, targetUserId, roleId)` — busca role (404) → `assertAdminForRoleAssignment` (403) → busca user (404) → localiza UserRole ativo em `user.roles` (404 se não tiver) → se `role.appliesTo` não for null, conta as demais roles ativas do user com o mesmo `appliesTo` (excluindo a atual) e bloqueia com 409 se for zero
  - ✅ Repository `removeUserRole(userRoleId)` em `permission.repository.ts` (soft delete — espelha `removeUserFeature`)
  - ✅ Controller + rota `DELETE /roles/:roleId` (`canAccess("manage:permission")`) — responde 204
  - ✅ Rodar suíte e confirmar verde

- ✅ Atualizar CONTEXT.md com o racional da não-escalação generalizada (por que cobre roles, não só overrides)

### ✅ Permissions efetivas + me
- ✅ `GET /users/:userId/permissions` (efetivas, reusa `computeEffectiveFeatures`)
  - ✅ Testes de integração: 401 sem token; 403 sem `read:permission`; 403 sem `read:permission` em usuário inexistente (não vaza 404); 422 userId inválido; 404 user não encontrado; 200 features efetivas do próprio usuário; 200 features efetivas de outro usuário (ator com `read:permission`); 200 override deny remove feature de role; 200 override grant adiciona feature fora de qualquer role
  - ✅ Shape: `string[]` (só as features efetivas — não roles, não overrides), decisão confirmada com o usuário e alinhada à nota já registrada em `CONTEXT.md`
  - ✅ Schema `getUserPermissionsParamsSchema` em `permission.schema.ts`
  - ✅ Service `getUserPermissions(userId)` em `permission.service.ts` — reusa `getUserForFeatureComputation` (user.repository) + `computeEffectiveFeatures`, array ordenado (`.sort()`) para resposta determinística
  - ✅ Presenter `effectiveFeaturesPresenter` (`z.array(z.string())`) em `permission.presenter.ts`
  - ✅ Controller + rota `GET /permissions` (`canAccess("read:permission")`)
- ✅ `GET /api/v1/me` (view `me` com features efetivas)
  - ✅ Testes de integração: 401 sem token; 403 sem `read:user`; 200 perfil customer com suas roles; 200 perfil employee com suas roles; 200 usuário com os dois perfis (roles não se misturam entre eles); 200 perfil soft-deletado não aparece (`null`); 200 override deny remove feature; 200 override grant adiciona feature; 200 admin com feature `"*"`
  - ✅ Decisões confirmadas com o usuário: exige feature `read:user` (mesmo padrão de `GET /users/:id`); roles dentro de `customer`/`employee` em shape enxuto (`{id,name,description,appliesTo}`, sem features aninhadas — já cobertas pelo `features` efetivo); perfil soft-deletado retorna `null`
  - ✅ Módulo próprio `src/modules/me/` (`me.routes.ts`, `me.controller.ts`, `me.service.ts`, `me.presenter.ts`), montado em `/api/v1/me` — reusa `userRepository.findUserById` (sem query nova) e `req.user.features` já computado pelo `authenticate` (sem recomputar `computeEffectiveFeatures`)
  - ✅ Rodar suíte e confirmar verde

### ✅ Fechos pendentes
- ✅ signup usa `createCustomer` (já resolvido no commit `f531e4d`; nenhum código morto restante em `auth.service.ts`/`auth.repository.ts`/`user.repository.ts`)
- ✅ `z.guid` → `z.uuid` em todo o repo (`feature.schema.ts`, `role.schema.ts`, `auth.schema.ts`)

> **Testes refatorados p/ helpers novos:** user, role, feature, status, permission, profile (customer+employee CRUD+DELETE), units (password, authorization) ✅ · **Falta:** auth — movido para a Fase 3 (ver abaixo), decisão explícita: não mexer em `auth.test.ts` (nem o fix do import quebrado) até lá

---

## Fase 3 — Auth alvo (access JWT + refresh opaco rotativo) ✅

> Migra de "1 JWT guardado como Session, validado no banco a cada request" pra "access JWT 15min validado localmente + refresh opaco rotativo em Session, só tocado em /refresh". Resolve de quebra a dívida do `authenticate` usando `res.json` cru (item que estava anotado aqui como dívida técnica — fechado dentro da seção do middleware abaixo). Detalhe completo das decisões no CONTEXT.md.

### ✅ Fundação (schema, libs, constants)
- ✅ Migration: `Session` perde `token`, ganha `refreshTokenHash` (`@unique`), `usedAt`, `userAgent`, `ipAddress`; mantém `expiresAt`/`invalidatedAt`/`createdAt`/`userId`. SQL editado à mão com `TRUNCATE TABLE "sessions"` antes do reshape (sessões antigas não sobrevivem à migração — aceitável em dev)
- ✅ `npm install cookie-parser` + `npm install -D @types/cookie-parser`; wire em `src/app.ts` entre `express.json()` e `authenticate`
- ✅ `src/lib/token.ts`: `generateOpaqueRefreshToken()` (crypto.randomBytes) + `hashRefreshToken()` (SHA-256) — TDD, testes unitários em `src/__tests__/unit/lib/token.test.ts` primeiro
- ✅ `src/modules/auth/auth.constants.ts`: `REFRESH_TOKEN_COOKIE_NAME`, `REFRESH_TOKEN_TTL_MS` (7 dias, deslizante), `REFRESH_TOKEN_COOKIE_PATH` (`/api/v1/auth`)
- ✅ `feature.constants.ts`: adiciona `read:session`/`manage:session`; remove `logout:session`
- ✅ `role.constants.ts`: `SELF_MANAGEMENT_FEATURES` ganha as duas novas, perde `logout:session`; roda seed e confirma catálogo sincronizado (seed.ts ganhou um passo de poda de features órfãs — primeira vez que uma feature sai do catálogo)
- ✅ Efeito colateral consertado: `src/__tests__/unit/lib/authorization.test.ts` usava `"logout:session"` como feature-exemplo genérica em testes de `computeEffectiveFeatures` (lógica pura, sem relação com sessão) — trocado por `"read:session"`, mecânico
- ⚠️ **Estado esperado ao final deste item** (confirmado com o usuário, branch dedicada `feat/auth-refresh-rotation`, não mergear até a fase fechar): `npm run typecheck` mostra só os erros já previstos em `auth.repository.ts`/`auth.service.ts` (uso de `Session.token`, que não existe mais) + o import quebrado pré-existente de `auth.test.ts`; testes de integração que dependem de `loginAs` falham em cascata (login grava em `token`, campo inexistente) até a seção de login ser reescrita — não é regressão, é o próximo item da fase

### ✅ Middleware `authenticate` (refactor + testes próprios) — dívida técnica fechada aqui
- ✅ Testes unitários primeiro: `src/__tests__/unit/middlewares/authenticate.test.ts` (sem precedente no projeto — primeiro uso de `vi.mock()` no repo; mocka só `getUserForFeatureComputation`, `req`/`res` como objetos simples, asserts via promise rejeitada já que o middleware é chamado direto, fora do Express)
  - ✅ Sem header → `next()` sem erro, `req.user` continua `undefined`
  - ✅ Header sem "Bearer " ou token vazio → rejeita 401
  - ✅ JWT malformado/assinatura inválida → rejeita 401
  - ✅ JWT expirado → rejeita 401
  - ✅ JWT válido sem `sub` → rejeita 401
  - ✅ JWT válido, usuário não encontrado (`getUserForFeatureComputation` retorna null) → rejeita 401
  - ✅ JWT válido + usuário encontrado → `req.user` populado corretamente, `next()` sem erro
  - ✅ Regressão: `getUserForFeatureComputation` chamado exatamente 1x (documenta "1 leitura de banco, não 2")
- ✅ Rodar suíte e confirmar falha (8/9 vermelhos, "sem header" já passava por não mudar de comportamento)
- ✅ Reescrever `authenticate.middleware.ts`: valida JWT só localmente (assinatura + expiração), sem `findSessionByToken`; `req.user.id` passa a vir de `payload.sub` (não mais `session.userId`); todos os erros via `create*Error` (throw, não `res.json`)
- ✅ Rodar suíte e confirmar verde (9/9; suíte unitária completa 40/40; `typecheck` só com os erros já esperados desde o item 1)

### ✅ `POST /auth/login` (TDD)
- ✅ Testes de integração primeiro (em `auth.test.ts`) — reescritos pro padrão correto: `signup` migrado de `makeUserData` (interna, sem perfil — nunca deveria ter sido usada) pra `makeCustomerData`; `login`/`logout` migrados de "signup então login" pra `buildCustomer` (usuário real, com perfil + role, já no banco), como o resto da suíte. Casos de `login`: 200 só com `accessToken` no corpo; 200 cookie de refresh (`HttpOnly`/`SameSite=Lax`/`Path` certo/sem `Secure` em teste); 401 senha errada; 401 email inexistente; 422 email inválido; 422 senha vazia; dois logins geram duas `Session` independentes (prova que o quirk de reuso sumiu, checado via `prisma.session.findMany`)
- ✅ `src/lib/token.ts` reusado (`generateOpaqueRefreshToken`/`hashRefreshToken`); `auth.service.login`: sempre cria `Session` nova (quirk de reuso removido, `existingToken` saiu da assinatura); gera access (JWT, inalterado) + refresh (opaco, hash salvo); `userAgent`/`ipAddress` capturados do request e gravados na `Session` (decisão confirmada com o usuário — fecha o que o schema do item 1 já previa; normalizados pra `null` na fronteira do repository por causa do `exactOptionalPropertyTypes`)
- ✅ `auth.repository.createSession` (`CreateSessionData` novo: `refreshTokenHash`/`userAgent`/`ipAddress` no lugar de `token`)
- ✅ `auth.controller.login`: seta cookie de refresh (httpOnly, sameSite lax, secure em produção, path `/api/v1/auth`), responde `{ accessToken }` (sem refresh no corpo)
- ✅ Efeito colateral resolvido de propósito: `loginAs` (helper usado por toda a suíte de integração) atualizado pra ler `accessToken` em vez de `token` — sem isso, login already-corrigido continuaria "quebrado" pra todo o resto da suíte só por causa do nome do campo. TODO original previa esse fix só no fecho da fase; adiantado aqui por ser mecânico e sem risco
- ✅ Dois efeitos colaterais adicionais encontrados e corrigidos (heranças do rename `logout:session` → `read:session`/`manage:session` do item 1, que não tinham aparecido ainda porque a suíte de integração inteira estava vermelha): asserções desatualizadas em `me.test.ts` e `permission.test.ts` referenciando o nome antigo da feature
- ✅ Rodar suíte e confirmar verde (237/239 — os 2 vermelhos restantes são os testes de `logout`, fora de escopo deste item: `canAccess("logout:session")` na rota dá 403 porque a feature saiu do catálogo no item 1; conserto é o próximo item)

### ✅ `POST /auth/refresh` (TDD) — rotação + detecção de roubo
- ✅ Testes de integração primeiro: sem cookie → 401; hash não encontrado → 401; sessão invalidada → 401; sessão expirada → 401; replay de refresh já usado invalida TODAS as sessions do usuário (testado com 2 dispositivos independentes — a terceira sessão, sem relação com a reusada, também precisa ficar invalidada); rotação com sucesso troca o valor do cookie e o novo access token funciona numa rota protegida (`GET /me`)
- ✅ **Mudança de arquitetura não prevista originalmente, decidida com o usuário**: `authenticate` saiu de global (`app.ts`) para por-grupo-de-rota (`routes/index.ts`) — motivo: `/auth/refresh` precisa funcionar mesmo com access token ausente/expirado, mas o `authenticate` global lançava 401 pra qualquer Bearer inválido antes mesmo da rota ser alcançada. `/status` e `/auth` (login/signup/refresh) ficaram públicos de propósito; `/me`, `/users`, `/users/:userId`, `/features`, `/roles` continuam protegidos, agora com `authenticate` aplicado no próprio `v1Router.use(...)`. Racional completo em `CONTEXT.md`
- ✅ `auth.repository`: `findSessionByHash`, `rotateSession` (transação: marca antiga `usedAt`, cria nova), `invalidateAllUserSessions` (ganhou o primeiro caller de verdade)
- ✅ `auth.service.refresh`: sem cookie → 401; hash não encontrado → 401; **`usedAt` setado → invalida TODAS as sessions do usuário (roubo) → 401**; `invalidatedAt` setado → 401; expirado → 401; senão rotaciona e retorna novo par (mesma mensagem genérica em todo 401, não revela qual checagem falhou)
- ✅ `auth.controller.refresh`: sem `canAccess` (funciona com access token ausente/expirado — é o propósito do endpoint); seta novo cookie, responde `{ accessToken }`
- ✅ Rota `POST /auth/refresh` sem `canAccess`
- ✅ Rodar suíte e confirmar verde (243/245 — os 2 vermelhos restantes continuam sendo os testes de `logout`, agora falhando com 401 em vez de 403 pela mesma causa raiz: `canAccess("logout:session")` sem `authenticate` próprio numa rota que ficou pública — fora de escopo, é o próximo item)

### ✅ `POST /auth/logout` (TDD)
- ✅ Testes de integração primeiro: 401 sem access token; 403 sem `manage:session`; 401 sem cookie de refresh; 404 sessão não encontrada; 404 sessão de outro usuário (ownership — não vaza existência); 204 invalida + limpa o cookie; 204 idempotente; 204 não afeta outras sessões do mesmo usuário; access token continua válido até expirar mesmo após logout (documenta o trade-off do design stateless)
- ✅ **Redesenho decidido com o usuário** (diferente do texto original abaixo — desatualizado, escrito antes da mudança de arquitetura do item `refresh`): rota ganha `authenticate` própria (não o grupo `/auth`) + `canAccess("manage:session")` no lugar de `logout:session`; identifica a sessão pelo cookie de refresh (`findSessionByHash`, igual ao `refresh`), não mais pelo access token; confere que a sessão pertence ao `req.user.id` antes de invalidar (404 se não — mesma resposta de "não encontrada")
- ✅ `auth.service.logout(refreshToken, userId)`: sem cookie → 401; sessão não encontrada OU não é do usuário → 404 (mantém comportamento de 404 já existente); invalida (idempotente, `update` sobrescreve `invalidatedAt`) → sucesso
- ✅ `auth.controller.logout`: lê cookie, usa `getAuthUser(req)` (padrão já usado no resto do projeto), limpa cookie na resposta, 204
- ✅ Rota `POST /auth/logout` com `authenticate` + `canAccess("manage:session")` (não mais `logout:session`, removida do catálogo no item 1)
- ✅ `auth.repository`: removida `findSessionByToken` (órfã); `invalidateSession` passou a chavear por `id`, não mais por `token`
- ✅ Rodar suíte e confirmar verde — **252/252 testes + `npm run typecheck` limpo**, primeira vez desde o item 1 que tudo fecha ao mesmo tempo

### ✅ `GET /api/v1/auth/sessions` (feature `read:session`)
- ✅ Testes de integração primeiro: 401 sem access token; 403 sem `read:session`; 200 lista só sessões vivas do próprio usuário (cria vivas + rotacionada + invalidada + expirada, confirma que só as vivas aparecem); 200 não inclui sessões de outro usuário; shape via `sessionPresenter`/`toMatchView` (sem `refreshTokenHash`)
- ✅ Rodar suíte e confirmar falha
- ✅ `auth.repository.findLiveSessionsByUserId` — filtro `usedAt: null, invalidatedAt: null, expiresAt: { gt: new Date() }` (nota: mais rigoroso que `invalidateAllUserSessions`, que não filtra `usedAt` — gap conhecido, tratado separadamente no fecho da fase)
- ✅ `auth.service.listSessions` — sem checagem de existência do user (garantida pelo `authenticate`); lista vazia é resultado válido
- ✅ `auth.presenter.ts` (view `default`: id, createdAt, expiresAt, userAgent, ipAddress)
- ✅ Controller + rota `GET /sessions` (`authenticate` + `canAccess("read:session")` próprios da rota, mesmo padrão do `logout`)
- ✅ Rodar suíte e confirmar verde (256/256 + `npm run typecheck` limpo)

### ✅ `DELETE /api/v1/auth/sessions/:id` (feature `manage:session`)
- ✅ Testes de integração primeiro: 401 sem access token; 403 sem `manage:session`; 422 `:id` inválido; 404 sessão de outro usuário (não vaza existência); 404 sessão inexistente; **404 sessão do próprio usuário mas já morta** (testado nos três estados: usada/invalidada/expirada); 204 revoga sessão viva própria; 204 não afeta outras sessões vivas do mesmo usuário (revogação pontual, não em massa)
- ✅ Rodar suíte e confirmar falha
- ✅ `auth.schema.sessionParamsSchema`
- ✅ `auth.repository.findSessionByIdForUser` (scoped por dono via `where: { id, userId }`, qualquer estado — não achar é indistinguível de "é de outro usuário")
- ✅ `auth.service.revokeSession`: não encontrada OU encontrada mas não viva → 404 genérico (mesma mensagem, não diferencia os casos); senão invalida → sucesso
- ✅ Controller + rota `DELETE /sessions/:id` (`authenticate` + `canAccess("manage:session")` próprios da rota, mesmo padrão do `logout`/`GET /sessions`)
- ✅ Rodar suíte e confirmar verde (266/266 + `npm run typecheck` limpo)

### ✅ Fechos da fase
- ✅ `src/__tests__/helpers/auth.ts`: `loginAs` lê `response.body.accessToken`; novos helpers `extractRefreshCookie(response)` e `loginWithSession(email, password)` — adiantados (itens `login` e `refresh`), não precisam ser refeitos aqui
- ✅ Reescrever `src/__tests__/integration/v1/auth.test.ts` por completo (conserta o import quebrado de `makeUserData` → nunca exportar, usar `buildCustomer`/`buildEmployee`, não a função interna sem perfil; migra pro padrão `buildCustomer`/`buildEmployee`/`loginAs`/`expectValidationError`/`toMatchView`), cobrindo: signup; login (access no corpo, refresh só em cookie, 401 credenciais erradas, dois logins geram duas sessions independentes); refresh (rotação troca o valor do refresh cookie, cookie antigo vira `usedAt`, replay do token antigo derruba TODAS as sessions do usuário incluindo as de outros logins/dispositivos, access token novo funciona numa rota protegida); logout (invalida só aquela sessão, não afeta outros dispositivos, cookie limpo na resposta, `Authorization` header + `authenticate`+`canAccess("manage:session")` próprios da rota); sessions (list/delete, casos completos); **adicionado além do previsto**: teste ponta-a-ponta signup real (via `POST /auth/signup`) → login → `GET /me` → refresh → `GET /sessions` → logout, num usuário genuinamente criado pelo endpoint (não via `buildCustomer`), fechando o gap de nunca ter exercitado esse caminho completo numa sequência só
- ✅ **Refactor de `authenticate` (global → por grupo de rota, feito no item `refresh`) confirmado**: nenhum grupo protegido ficou sem `authenticate` em `routes/index.ts`; `/status` e `/auth` continuam públicos de propósito; `logout`, `GET /auth/sessions` e `DELETE /auth/sessions/:id` têm `authenticate` própria (não o grupo `/auth` inteiro)
- ✅ `user.repository.softDeleteUserAndInvalidateSessions`: filtro do `updateMany` ganha `usedAt: null` (mesma tripla de `findLiveSessionsByUserId`)
- ✅ **Auditoria geral pedida pelo usuário ao fechar a fase** (routing/middlewares, referências obsoletas ao shape antigo de `Session`, fluxo ponta-a-ponta) — achados extras corrigidos, fora do escopo original da fase:
  - `canAccess.middleware.ts` migrado de `res.status().json()` cru para `createUnauthorizedError`/`createForbiddenError` — mesma dívida técnica que a fase já tinha fechado para `authenticate`, mas que não tinha sido estendida a `canAccess`. Confirmado seguro: toda asserção de teste existente usa `toMatchObject`, não `toEqual` estrito, então os campos extras do `AppError.toJson()` (`name`, `statusCode`) não quebram nada
  - `refreshSessionSchema` (código morto em `auth.schema.ts`, zero usos, pré-datava o design atual de identificar sessão por `id`/cookie) removido
  - **Decisão explícita tomada durante a implementação**: `auth.repository.invalidateAllUserSessions` (resposta a roubo no `refresh`) NÃO ganhou o filtro `usedAt: null` — diferente de `softDeleteUserAndInvalidateSessions`, de propósito. O teste `"should invalidate ALL of the user's sessions when a used refresh token is replayed"` exige que TODA sessão do usuário fique com `invalidatedAt` setado, inclusive a já usada, para auditoria completa do incidente. Adicionar o filtro quebraria esse teste e essa garantia. Racional completo no `CONTEXT.md`
  - Reativados dois testes comentados em `permission.test.ts` (de antes da Fase 3, sem relação com ela) que testam a regressão "override soft-deletado devolve a feature" e "re-grant após soft-delete sem choque de unicidade" — estavam comentados por causa de um `import { prisma }` faltando no arquivo (`ReferenceError`, não um problema de lógica); corrigido o import, testes voltaram a passar sem qualquer mudança de lógica
- ✅ `npm run typecheck` + `npm run test:run` limpos
- ✅ `TODO.md` marcando a fase como ✅ e `CONTEXT.md` atualizado com o racional do design de `Session`, a ordem de checagem no `refresh`, e a distinção de critério entre `invalidateAllUserSessions` e `softDeleteUserAndInvalidateSessions`

---

## Fases seguintes (resumo)
- **Fase 4 — Email + status:** nodemailer; status PENDING/ACTIVE/BANNED + EmailVerificationToken + activate; bloquear login não-ACTIVE; PasswordResetToken (forgot/reset); change-password. (É aqui que o soft delete ganha peso — vendas se ligam a customer.)
- **Fase 5 — Hardening:** rate limiting, account lockout. (Revisitar proteção de escalação se precisar de algo além do admin-only.)
- **Fase 6 — Domínio pet shop:** model Pet (Customer 1:N), CRUD aninhado em customers, scopes own/others, views owner/staff.

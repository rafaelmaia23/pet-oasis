# pet-oasis — Endpoints

> Índice interno das rotas existentes (1 linha por rota). O contrato formal da API é o `GET /openapi.json` (OpenAPI 3.1) + a UI interativa em `GET /reference`; este arquivo é só o índice enxuto para organização enquanto o projeto cresce.
> Ao adicionar/alterar rotas, atualize aqui. Detalhe de decisões no `docs/context.md`.

## Mounting

As rotas de negócio ficam sob **`/api/v1`** (`src/routes/index.ts`). `authenticate` é aplicado **por grupo de rota**, não global:

- **Públicas** (sem `authenticate`): `/status`, `/auth`, `/breeds`.
- **Públicas com autenticação opcional** (`optionalAuthenticate` no mount, Fase 9.6): `/brands`, `/categories`, `/tags` e — desde a 9.7, ainda só com escrita — `/products`. Leem sem token e escrevem com feature — `optionalAuthenticate` identifica o ator quando o `Bearer` vem e segue anônimo quando não vem **ou quando o token é ruim**, sem nunca responder 401; quem exige identidade é o `canAccess` das rotas de escrita, dentro do router.
- **Protegidas** (`authenticate` no mount): `/me`, `/users`, `/users/:userId` (profile + permission), `/customers/:customerId` (pets), `/pets`, `/variants`, `/features`, `/roles`, `/audit-logs`, `/logs`.
- Exceção: 3 rotas dentro de `/auth` (público) aplicam `authenticate` **inline** na própria definição (`logout`, `GET /sessions`, `DELETE /sessions/:id`).

As rotas de **documentação** (`/openapi.json`, `/reference`) ficam no router de topo, **fora** de `/api/v1` e de `authenticate` — são públicas.

**Vitrine do catálogo (Fase 9.1 / N15):** a leitura de catálogo responde **sem token** — o e-commerce vive de quem chega pelo Google sem conta. `/breeds` (9.3) é pública "seca": não tem escrita nem view por capability, então basta não montar `authenticate`. A taxonomia (9.6) trouxe o middleware de **autenticação opcional**, porque ali leitura pública e escrita sob feature convivem no mesmo router; `/products` já entrou nesse grupo na **9.7**, que só tem escrita: montá-lo assim desde já faz o `GET` público da 9.8 ser acréscimo, não remontagem. `/variants` fica do lado protegido — variante não tem leitura pública própria, ela aparece dentro do produto.

**Rate limit da vitrine (Fase 9.6):** as quatro leituras públicas de catálogo (`/breeds`, `/brands`, `/categories`, `/tags`) compartilham um balde **por IP** (`catalogIpLimiter`, rule `catalog-read`) — não há identidade para um balde por usuário. Balde único de propósito: separar por rota daria a um scraper N orçamentos pelo preço de um. `/breeds` subiu na 9.3 sem limiter e foi coberta aqui.

Coluna **Auth**: `público` = sem token; `authenticate` = só exige estar logado; `feature` = exige a feature via `canAccess(...)`.

**Envelope de listagem (Fase 7.7 / D4):** toda rota de **lista** devolve `{ data, meta }` — `meta { page, limit, total }` no offset (`GET /users`), `meta { nextCursor, hasMore }` no cursor (`GET /audit-logs`), `meta {}` nas que não paginam. Exceção: `GET /users/:userId/permissions` segue `string[]` cru.

**Ordenação (Fase 9.2):** listagens por **offset** aceitam `?sort=<campo>&order=asc|desc`, com allowlist própria de cada recurso (campo fora dela → 422; `order` sem `sort` → 422). Omitir `order` usa a direção natural do campo. O cursor não tem ordenação configurável.

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
| POST `/api/v1/auth/confirm-email-change` | público | Confirma a troca via token, grava o email antigo em `PreviousEmail` (só histórico — não reserva o endereço, 8.6), 204 |
| POST `/api/v1/auth/confirm-account-reactivation` | público | Reativa a conta via token e define **senha nova** (obrigatória); restaura os perfis escolhidos e as roles que morreram com eles — overrides nunca voltam (D6'). `phone` só é exigido quando o perfil de cliente precisa nascer do zero. 204 |

## Me — `src/modules/me/me.routes.ts`

| Método + Path | Auth | Descrição |
|---|---|---|
| GET `/api/v1/me` | `read:user` | Perfil do usuário autenticado + features efetivas. `customer.id`/`employee.id` são os ids de **perfil** — é `customer.id` que endereça `/customers/:customerId/pets` (9.4) |

## User — `src/modules/user/user.routes.ts`

| Método + Path | Auth | Descrição |
|---|---|---|
| POST `/api/v1/users` | `create:user` | Cria um usuário employee |
| GET `/api/v1/users` | `read:user:others` | Lista usuários (offset `?page=&limit=` + filtros `status`/`banned`/`role` + ordenação `?sort=createdAt\|name\|email&order=asc\|desc`) |
| GET `/api/v1/users/:id` | `read:user` | Busca um usuário por id |
| PATCH `/api/v1/users/:id` | `update:user` | Atualiza um usuário |
| DELETE `/api/v1/users/:id` | `delete:user` | Soft delete do usuário + invalida sessões |
| POST `/api/v1/users/:id/ban` | `manage:user:status` | Bane o usuário (`bannedAt`/`bannedBy`/`banReason`) + invalida sessões, 204 |
| DELETE `/api/v1/users/:id/ban` | `manage:user:status` | Desbane o usuário (limpa colunas de ban, preserva `status`), 204 |
| DELETE `/api/v1/users/:id/lock` | `manage:user:status` | Desbloqueia a conta travada por lockout, reset completo do contador, 204 · conta com a role `demo` é isenta do lockout (8.8), então nunca chega a travar |
| POST `/api/v1/users/:id/force-password-reset` | `manage:user:status` | Força troca de senha (bloqueia login até o reset), invalida sessões + envia email de reset, 204 |
| POST `/api/v1/users/:id/reactivate` | `reactivate:user` | Dispara a reativação de uma conta excluída escolhendo perfis (obrigatório, ≥1) e roles (opcional, default = as da cascata); **não reativa**, só emite o token e envia o email — quem conclui é o dono. 204 · 404 conta não excluída · 409 banida · 422 perfil de funcionário inexistente · 403 role privilegiada sem ator admin |

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
| POST `/api/v1/users/:userId/roles/:roleId` | `manage:permission` | Concede uma role ao usuário (reusa a linha se já houve — 201 nos dois casos; os overrides dela **não** voltam, D6') |
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

## Breed — `src/modules/breed/breed.routes.ts`

| Método + Path | Auth | Descrição |
|---|---|---|
| GET `/api/v1/breeds` | público | Catálogo de raças. Filtro opcional `?species=DOG\|CAT\|RABBIT\|BIRD\|RODENT\|REPTILE\|FISH` (valor fora do enum → 422); sem paginação (`meta {}`). Só cão e gato têm raça cadastrada — espécie válida sem raça devolve lista vazia, não erro |

## Brand — `src/modules/brand/brand.routes.ts`

| Método + Path | Auth | Descrição |
|---|---|---|
| GET `/api/v1/brands` | público | Marcas ativas, ordenadas por nome; sem paginação (`meta {}`) |
| POST `/api/v1/brands` | feature `manage:catalog-structure` | Cria marca. `slug` derivado do nome se ausente; nome/slug únicos **globalmente** (linha excluída inclusive) → recriar marca apagada é 409. Nome sem slug utilizável ("!!!") → 422 nomeando `name` |
| PATCH `/api/v1/brands/:brandId` | feature `manage:catalog-structure` | Atualiza. Renomear **não** re-deriva o slug; mandar `slug` explicitamente é a porta de saída. `logoPath` é recusado no corpo (é do upload, 9.10) |
| DELETE `/api/v1/brands/:brandId` | feature `manage:catalog-structure` | Soft delete (204). A linha continua ocupando nome e slug |

## Category — `src/modules/category/category.routes.ts`

**Árvore de no máximo 3 níveis (Fase 9.6 / W1)**, modelando a **função** do produto (`Alimentação > Ração > Ração seca`) — espécie é faceta do produto, nunca nível da árvore. Produto pode vincular a **qualquer nó**, folha ou não (W2).

| Método + Path | Auth | Descrição |
|---|---|---|
| GET `/api/v1/categories` | público | **Árvore aninhada**: `data` traz as raízes, filhas em `children`, ordenadas por `position` e depois nome. Não pagina (`meta {}`) — cortar uma árvore no meio devolveria filho sem pai. Categoria viva com pai excluído sobe para a raiz em vez de sumir |
| POST `/api/v1/categories` | feature `manage:catalog-structure` | Cria. `parentId` inexistente/excluído ou que criaria um 4º nível → 422. Slug único global + derivado do nome ⇒ homônimas em ramos diferentes colidem em 409; a saída é mandar `slug` |
| PATCH `/api/v1/categories/:categoryId` | feature `manage:catalog-structure` | Atualiza e/ou move. `parentId: null` promove o nó (e a subárvore) à raiz. Três 422 de `parentId`: si mesma, descendente (ciclo) e estouro de profundidade — este último medindo a **altura da subárvore**, porque o nó movido carrega filhos junto. Responde o nó, com `children` vazio |
| DELETE `/api/v1/categories/:categoryId` | feature `manage:catalog-structure` | Soft delete de **folha** (204). Com subcategoria ativa **ou com produto ativo vinculado** → **409**: sem cascata e sem reparenting (W3). Desvincular o produto violaria o mínimo de uma categoria por produto (9.7/X7), então a saída é movê-lo; vínculo de produto excluído não segura nada |

## Tag — `src/modules/tag/tag.routes.ts`

| Método + Path | Auth | Descrição |
|---|---|---|
| GET `/api/v1/tags` | público | Tags ordenadas por nome; sem paginação (`meta {}`) |
| POST `/api/v1/tags` | feature `manage:catalog-structure` | Cria. Só `name` e `slug` — **sem `description`** (rótulo que precisa de explicação é categoria); mandá-la é 422 |
| PATCH `/api/v1/tags/:tagId` | feature `manage:catalog-structure` | Atualiza; renomear não mexe no slug |
| DELETE `/api/v1/tags/:tagId` | feature `manage:catalog-structure` | **Hard delete** (204, W5) — a linha some e o nome fica livre. Única assimetria do trio; o audit log é o único registro de que a tag existiu |

## Product — `src/modules/product/product.routes.ts`

**Só escrita nesta fase (9.7).** A leitura (`GET /products`, detalhe, filtros e views por capability) é da 9.8. `Product` é a identidade comercial e `ProductVariant` a unidade vendável: **todo produto tem ≥1 variante**, e exatamente uma delas é a default.

A view da resposta é escolhida pelo **ator**, não pela rota: `costCents` só aparece para quem tem `read:product:cost`, mesmo em quem acabou de criar o produto.

| Método + Path | Auth | Descrição |
|---|---|---|
| POST `/api/v1/products` | feature `manage:product` | Cria produto **com** suas variantes (`variants` min 1, X3) e vínculos, numa transação. `categories` exige min 1 (X7); `tags` é opcional; `targetSpecies` vazio = qualquer espécie. `slug` derivado do nome se ausente e único global (409 na colisão, inclusive contra produto excluído). SKU repetido dentro do corpo → 422 nomeando `variants`; SKU já usado no banco → 409. Duas variantes marcadas default → 422; nenhuma marcada → a primeira é promovida (X5) |
| PATCH `/api/v1/products/:productId` | feature `manage:product` | Atualiza. Renomear **não** re-deriva o slug (W4). `categories`/`tags` são **substituição total**: o array enviado vira o conjunto, campo ausente preserva o atual, `categories: []` → 422. `variants` não é aceito (variante tem rotas próprias) |
| DELETE `/api/v1/products/:productId` | feature `manage:product` | Soft delete (204) **com cascata nas variantes**, um único timestamp para as duas tabelas (X8). Nome, slug e SKUs continuam ocupados; o audit registra `cascadedVariants` |

## Product variant — `src/modules/product/product.variant.routes.ts`

**Coleção aninhada, recurso plano** — mesmo racional dos pets: criar precisa do produto na URL, o item é global por UUID.

| Método + Path | Auth | Descrição |
|---|---|---|
| POST `/api/v1/products/:productId/variants` | feature `manage:product` | Cria variante. `sku` é unique **global**, valendo para a variante excluída (X1) → duplicata é 409. `isDefault: true` rebaixa a default anterior na mesma transação |
| PATCH `/api/v1/variants/:variantId` | feature `manage:product` **e/ou** `manage:stock` | A feature é exigida **por campo presente** (X4): `stockQuantity` pede `manage:stock`, qualquer outro campo pede `manage:product`, corpo misto pede as duas — é o que deixa o repositor contar prateleira sem editar o catálogo. `stockQuantity` negativo → 422 (X2). `isDefault` só aceita `true`: rebaixar sem eleger outra é 422. Ajuste de estoque vira ação própria no audit (`PRODUCT_STOCK_ADJUSTED`, com `from`/`to`) |
| DELETE `/api/v1/variants/:variantId` | feature `manage:product` | Soft delete (204). **409** quando é a última variante ativa do produto (X6) — para tirar o produto de circulação use `status: DISCONTINUED` ou exclua o produto. Se a excluída era a default, a mais antiga entre as restantes é promovida |

## Pet — `src/modules/pet/pet.routes.ts` e `pet.customer.routes.ts`

**Coleção aninhada, recurso plano (Fase 9.4 / N4):** o `POST`/`GET` moram sob o cliente porque ali o pai é parte da identificação — é *onde* o pet nasce. O item é plano porque `petId` é UUID global: repetir o `customerId` no caminho seria redundante, e redundante pode **discordar** do dono real, obrigando a inventar uma regra para um caso que só a rota criou.

**`:customerId` é o id do perfil** (`Customer.id`), não o do usuário — `GET /me` o devolve em `customer.id`. Não há `/me/pets` nesta fase (backlog).

**Escopo em duas etapas:** `canAccess` admite dono e staff indistintamente (forma frouxa de `can`); quem separa é o service. Como o dono só é conhecido depois do banco, o alvo **inexistente falha fechado** — sem `:others`, responde **403**, não 404, senão a rota vira oráculo de existência de `customerId`/`petId`. A exceção é `GET /pets` (9.5), que exige `read:pet:others` **direto na rota** — listar pet de terceiro é a definição dela, e por isso o service nem recebe ator.

**Duas coleções, um paginado só:** `GET /customers/:customerId/pets` **não pagina** (`meta {}`, classe de `GET /users/:userId/roles`) porque a coleção já é limitada pelo dono e o critério ali é afetivo — pet falecido continua na lista. `GET /pets` pagina por offset porque é lista operacional sobre a base inteira. Quem quer os pets de um cliente **paginados** usa `GET /pets?customerId=`.

| Método + Path | Auth | Descrição |
|---|---|---|
| POST `/api/v1/customers/:customerId/pets` | `manage:pet` \| `manage:pet:others` | Cadastra um pet para o cliente. Espécie em `SPECIES_WITH_BREED` (cão, gato) **exige** `breedId`; as demais o **proíbem**; raça de outra espécie → 422 — os três nomeiam `breedId`. `microchipId` duplicado → 409 (unique global) |
| GET `/api/v1/customers/:customerId/pets` | `read:pet` \| `read:pet:others` | Pets do cliente, sem paginação (`meta {}`), `createdAt desc` com desempate por `id`. Pet **falecido continua na lista**; excluído, não |
| GET `/api/v1/pets` | `read:pet:others` | Listagem geral (balcão), **paginada por offset** e ordenável (`?sort=createdAt\|name\|species&order=asc\|desc`). Filtros: `species`, `sex`, `customerId`, `breedId`, `microchipId`, `neutered`, `deceased`. `customerId`/`breedId` são **filtro**, não resolução de recurso — id bem-formado inexistente devolve lista vazia, nunca 404 |
| GET `/api/v1/pets/:petId` | `read:pet` \| `read:pet:others` | Detalhe do pet, com a raça achatada (`{ id, name }` ou `null`) |
| PATCH `/api/v1/pets/:petId` | `manage:pet` \| `manage:pet:others` | Atualiza a ficha. `customerId` (transferência é backlog), `deceasedAt` (rota própria) e `photoPath` (upload, 9.10) → 422. `species` **é** editável e revalida a raça sobre o estado resultante |
| DELETE `/api/v1/pets/:petId` | `manage:pet` \| `manage:pet:others` | Soft delete (204) |
| POST `/api/v1/pets/:petId/deceased` | `manage:pet` \| `manage:pet:others` | Registra o falecimento (204). Idempotente — remarcar não reescreve a data. `deceasedAt` ≠ `deletedAt`: o pet **permanece** na lista do dono |
| DELETE `/api/v1/pets/:petId/deceased` | `manage:pet` \| `manage:pet:others` | Desfaz o registro feito no pet errado (204) |

## Audit log — `src/modules/audit-log/audit-log.routes.ts`

| Método + Path | Auth | Descrição |
|---|---|---|
| GET `/api/v1/audit-logs` | `read:audit-log` | Trilha de auditoria (cursor; filtros `action`/`actorId`/`targetType`/`targetId`/`from`/`to`); `ip` mascarado sem `read:audit-log:full`. Só GET (append-only) |

## Log — `src/modules/log/log.routes.ts`

| Método + Path | Auth | Descrição |
|---|---|---|
| GET `/api/v1/logs/recent` | `read:log` | Linhas recentes do ring buffer em memória (`?limit=`; mais novas primeiro; `meta` declara por-processo/volátil) |

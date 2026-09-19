# Contratos de API — views, erros, validação e paginação

> O que a API promete ao cliente. As rotas em si estão em
> [`reference/endpoints.md`](../reference/endpoints.md); o contrato formal é o
> `/openapi.json`, gerado dos próprios schemas Zod.

---

## Onde o contrato vive

### Schemas de request e views são código do pacote `@pet-oasis/api-contracts` (11.10)

Todo schema de request (create, update, query, path) e toda view de resposta vivem em
`packages/api-contracts/src/<domínio>/` — `user`, `auth`, `me`, `role`, `feature`, `permission`,
`pet`, `catalog`, `audit-log`, `log`, `pagination`, `errors` —, e a API os **importa** de lá:
controllers, presenters, `docs/paths/*` e testes. Nenhum `*.schema.ts` sobrou em
`apps/api/src/modules/`; os `*.presenter.ts` sobraram, mas só com o helper de whitelist aplicado
sobre a view importada (`createPresenter(userViews)`) e o que é serialização da API (`maskIp`).
A resolução de view por capability (`resolveUserView`, `readViewFor`) continua na API — quem sabe
o que o viewer pode é a API, não o contrato.

A fronteira foi decidida caso a caso pelo mesmo critério: **o que precisa de algo que não é
`zod` não é contrato**, e fica na API como composição por cima do schema do contrato.

- Enum do Prisma nos schemas (`z.enum(PetSpecies)`) virou o enum do contrato
  (`petSpeciesSchema`); o teste de paridade é o que mantém os dois donos iguais.
- Da paginação migrou o que o cliente manda e recebe (`offsetQuerySchema`, `cursorQuerySchema`,
  `buildOffsetQuerySchema`, `defineSortConfig`, os `meta`); ficou em `lib/pagination.ts` o que
  traduz isso em banco (`skip`/`take`, `orderBy` com tiebreaker, cursor, envelopes).
- `resolveSlug` (usa `slugify` e lança o 422) ficou em `catalog.slug.ts`; `slugSchema`,
  `catalogNameSchema` e `catalogDescriptionSchema` migraram.
- O teto do token opaco (`OPAQUE_TOKEN_LENGTH`) virou constante do contrato, porque é o `.max()`
  dos campos `token`; `lib/token.ts` deriva os bytes dele, e não o contrário.
- `MAX_IMAGES_PER_PRODUCT` mora ao lado do schema de reordenação que ele limita; a taxonomia de
  auditoria (`AUDIT_ACTIONS`, `AUDIT_TARGET_TYPES`) é o que `?action=`/`?targetType=` aceitam e
  migrou inteira — `lib/auditLog.ts` tipa o descritor a partir dela.
- `role.constants.ts` e `feature.constants.ts` deixaram de reexportar: quem precisa de
  `RoleName`, `FeatureName`, `PRIVILEGED_FEATURES` etc. importa do contrato; os dois arquivos
  guardam só o que o seed anexa a cada nome.

O `openapi.json` gerado saiu **byte a byte idêntico** ao anterior em cada commit da migração
(o `.meta()` viajou junto), a suíte de `mass-assignment` e os testes de schema passaram sem
alteração, e os testes unitários dos schemas que migraram (paginação, `targetType` do audit)
migraram para `packages/api-contracts/tests/`. Dentro do pacote, enums e nomes vivem em arquivos
folha (`user.enums.ts`, `role.names.ts`, `pet.enums.ts`, …) e todo import entre domínios aponta
para a folha, nunca para o índice — é o que impede um ciclo `user → role → user` de virar TDZ.

---

## Views (presenter)

Cada recurso tem views resolvidas pela **capability do viewer** (não pelo role). `.parse()`
derruba campos não listados → nada sensível vaza por omissão.

### Whitelist e não blacklist

Listar o que **pode** sair é à prova de futuro: um campo sensível novo no model não vaza por
omissão, porque não está na view. Blacklist exigiria lembrar de excluir cada campo novo.

### Por capability, não por role

A feature `read:user:others` pode vir de role **ou** de override. Resolver por role perderia quem
tem a capability por override. A capability é a verdade.

### User — progressão por capability

- `default` (id, name) → qualquer um vê de qualquer user
- `owner` (+ email, pendingEmail, cpf, customer/employee aninhados nullable) → o próprio dono
- `me` (owner + features efetivas `string[]`) → o próprio, em `/me`
- `admin` (+ createdAt, updatedAt, roles `[{role:{id,name}, features:[{granted,grantedAt,feature}]}]`)
  → quem tem `read:user:others`. Desde a 8.0 os overrides moram **dentro** da atribuição de role,
  não num `features` no topo — a view espelha a junção para não perder a qual atribuição cada
  ajuste pertence.

`cpf` aparece em `owner` (dado próprio) e `admin` (gerente vê — normal em pet shop, vendas ligadas
a cpf).

### Demais recursos

- **Role**: id, name, description (obrigatória), appliesTo (`enum`, **não** nullable desde a Fase
  8), features `[{id,name,description}]` — junção achatada no service
  (`role.features.map(rf => rf.feature)`).
- **Feature**: id, name, description.
- **Breed**: id, name, species — view única (catálogo público, sem campo sensível).
- **Pet** (9.4): view **única** também, e por um motivo diferente do `Breed` — não há campo da
  ficha que o funcionário veja e o dono não. O que separa os dois é a autorização de **escopo**
  (`own` × `:others`), que decide *se* a ficha sai, não *quanto* dela. A raça sai achatada
  (`breed: {id,name} | null`) em vez de repassar a linha inteira da junção.
- **Permission**: `/features` = overrides crus `[{granted, grantedAt, updatedAt, role, feature}]`;
  `/permissions` = efetivas `string[]`.
- **Session** (`GET /auth/sessions`): id, createdAt, expiresAt, ipAddress, `device` e `current`. A
  view **não** expõe o `userAgent` cru — ele entra parseado por `describeUserAgent`
  (`src/lib/userAgent.ts`, função pura sobre `ua-parser-js`) como `"Chrome no Windows"`, com
  fallback `"Dispositivo desconhecido"`. `current` compara o hash do refresh token do cookie da
  própria request contra o `refreshTokenHash` de cada linha — sem cookie (acesso só com o access
  token), nenhuma sessão é marcada como atual.

### `GET /me`

Exige a feature `read:user` (mesmo padrão de `GET /users/:id`); perfil soft-deletado aparece como
`null` (não sobe perfil morto); roles aninhadas dentro de `customer`/`employee` em shape enxuto
(`{id,name,description,appliesTo}`, sem features aninhadas — as capacidades já estão cobertas pelo
`features` efetivo do topo).

**O id de perfil entrou na 9.4** (`customer.id`/`employee.id`, aqui e na view `owner` de user).
Não é cosmético: a coleção de pets é aninhada em `/customers/:customerId/pets`, e a decisão de
**não** ter `/me/pets` (`docs/reference/backlog.md`) se apoiava explicitamente em "o `GET /me` já
devolve `customer.id`" — que era falso. Sem o campo, o dono não tinha como chegar aos próprios
pets. Vale a pena registrar o padrão do erro: uma decisão de recorte foi tomada com base numa
capacidade que se supunha existir e nunca foi conferida no código.

---

## Superfície pública

### A vitrine do catálogo responde sem token (9.1)

`GET /products`, `GET /products/:idOrSlug`, `/categories`, `/brands`, `/tags` e `/breeds` são
**públicas**. O motivo é o produto, não a técnica: o e-commerce vive de alguém buscar "ração" no
Google, cair na página do produto sem conta nenhuma e decidir se compra. Login entra só no
carrinho, na Fase 10. Toda a escrita e todas as rotas de pet continuam autenticadas.

Três consequências, todas herdadas pelas sessões 9.6/9.8:

1. **Nasceu uma autenticação opcional** (implementada na 9.6). `authenticate` era tudo-ou-nada:
   tolerava header ausente, mas token malformado ou expirado ainda virava 401. A vitrine precisa de
   um terceiro comportamento — se vier `Bearer`, identifica o ator; se não vier **ou se o token for
   ruim**, segue anônimo e nunca responde 401. É isso que faz o mesmo `GET /products` devolver a
   view pública ao visitante e a interna a quem tem `read:product:internal`. Detalhe do desenho em
   [architecture.md](architecture.md#optionalauthenticate--o-terceiro-modo-para-a-vitrine-pública-96).
2. **Não existe feature de leitura pública de catálogo.** Não há o que conceder ao cliente para
   ele ver produto — a role `customer` sai da Fase 9 só com as features de pet. O sufixo
   `:internal` já significa "acima do baseline", e o baseline aqui é o anônimo.
3. **Rate limit e cache são por IP, sem identidade.** (O limite entrou na 9.6: balde único
   `catalog-read` para as quatro leituras públicas — separar por rota daria N orçamentos a um
   scraper pelo preço de um.) É a primeira leitura em volume do projeto
   sem ator; o Redis já está disponível para as duas coisas.

A view pública é à prova de vazamento **por definição** (whitelist do presenter), não por
permissão: sem `costCents`, sem `stockQuantity` exato — disponibilidade como booleano derivado — e
sem produto `DRAFT`/`DISCONTINUED`.

---

## Erros

422 VALIDATION_ERROR (`errors` por campo), 409 CONFLICT, 404 NOT_FOUND, 403 FORBIDDEN (`action`
nomeia a feature exigida), 401 UNAUTHORIZED. DELETE de recurso = 204 — tanto user quanto perfil; no
perfil o user continua existindo, só o `Customer`/`Employee` é soft-deletado.

### P2002 no handler, não check antecipado

O check `findByEmail` antes de criar tem corrida: entre o SELECT e o INSERT, outro request insere. O
constraint `@unique` é a garantia real; traduzir o P2002 fecha a corrida e cobre todos os campos
únicos de uma vez.

### Validação sintática × semântica

Sintática (Zod, sem banco) no controller; semântica (precisa de banco — `appliesTo`, etc.) no
service. Ambas produzem 422 no mesmo shape.

---

## Paginação

### Duas estratégias, um envelope só

**Offset** para listas de CRUD (com `total` e salto para página arbitrária) e **cursor/keyset** para
listas append-only ordenadas por tempo, onde offset pula e repete registros sob escrita concorrente.
Naturezas diferentes, ferramentas diferentes — mas **todas** as listagens devolvem `{ data, meta }`,
inclusive as que não paginam, para o cliente ter contrato único e para paginar uma delas amanhã ser
aditivo em vez de breaking.

Exceção: `GET /users/:userId/permissions` segue `string[]` cru (é um conjunto de capacidades
computado, não uma coleção de recursos).

O **tiebreaker por `id`** na chave do cursor é obrigatório: sem ele, dois registros com o mesmo
timestamp fazem a borda da página pular ou repetir. Limites e alternativas no ADR
[`pagination.md`](../adr/pagination.md).

### Ordenação configurável só no offset

`?sort=<campo>&order=asc|desc` (Fase 9.2) existe **só na paginação por offset**: no cursor a chave
teria que codificar o próprio campo de ordenação, e a limitação segue registrada no backlog.

Cada recurso declara uma **allowlist** que é um mapa *campo → direção natural* — campo fora dela
morre em **422**, e nome nenhum vindo do request alcança o `orderBy` do Prisma. A direção natural é
o que responde `?sort=` sem `?order=` (data desce, texto sobe), de modo que `?sort=createdAt` não
inverte a listagem em relação a não mandar parâmetro. `?order=` sem `?sort=` é **422** nomeando
`order`: o default do recurso não é um alvo implícito. O **tiebreaker por `id`** passou a ser
obrigatório também no offset, seguindo a direção pedida — a mesma lição do cursor, que o `GET /users`
ainda não tinha. Decisões e forma no código no adendo do ADR
[`pagination.md`](../adr/pagination.md).

---

## Tipos

### A fronteira `FeatureName` × `string`

Tipo estreito (union literal) descreve o que você **sabe** em compile-time — vale onde se digita o
literal. Dado do banco é `string` em runtime (o banco não conhece o union). Forçar o union além
dessa fronteira gera `as`, que é mentira ao compilador. A fronteira é onde o Zod valida.

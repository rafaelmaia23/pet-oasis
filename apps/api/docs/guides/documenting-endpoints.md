# Documentar um endpoint/módulo novo (OpenAPI + Scalar + Bruno)

> Checklist do que fazer, além do código, sempre que nascer um endpoint ou módulo novo, para ele aparecer no `/openapi.json`, na UI `/reference` (Scalar) e na coleção Bruno. A fonte da doc são os **próprios schemas Zod** e a **tabela de rotas do contrato** — nada de escrever OpenAPI à mão.

O `/openapi.json` é **derivado** da tabela de rotas de `@pet-oasis/api-contracts/routes` ([`docs/adr/0003`](../../../../docs/adr/0003-route-table-is-contract-openapi-is-derived.md)), e o `/reference` (Scalar) só consome o `/openapi.json`; então **registrar a rota na tabela já cobre os dois**. Sobra o Bruno, que é manual. São 3 frentes: schemas → tabela de rotas → Bruno.

---

## 1. Anotar os schemas Zod com `.meta()`

Zod 4 nativo (sem monkey-patch). O `.meta()` alimenta `description`/`example` e nomeia componentes.

- **Request** (`packages/api-contracts/src/<domínio>/<mod>.schema.ts`): `.meta({ example })` nos campos que ajudam a entender o corpo/params. Manter a convenção do envelope `z.object({ body?, params?, query? })` — é dela que o helper extrai as partes (§2).
- **Response / views** (`packages/api-contracts/src/<domínio>/<mod>.views.ts`): dar `.meta({ id, description })` na view — o `id` vira o **nome do componente** no OpenAPI (ex.: `Role`, `UserOwner`). Campos com `.meta({ example })`. Quem aplica a whitelist sobre a view é o `registerRoute` (§3), ou o `*.presenter.ts` da API nas rotas que ainda não migraram.
- ⚠️ **Segurança grátis:** a view é uma *whitelist* (`.parse()` derruba o resto), então o exemplo de response nunca vaza `passwordHash`/`tokenHash`/etc. Não documente response por um schema cru do banco — sempre pela view do presenter.

```ts
// presenter.ts
const defaultView = z.object({
  id: z.uuid(),
  name: z.string().meta({ example: "manager" }),
}).meta({ id: "Role", description: "Papel do sistema" });
```

## 2. Registrar a rota na tabela do contrato

O path **não** mora na API: a rota inteira vive em
`packages/api-contracts/src/routes/<domínio>.routes.ts`, um módulo por domínio agregado em
`src/routes/index.ts`. A entrada é nomeada pela **operação** (`routes.role.get`), e o path vai
na forma do **Express** (`:id`) — quem converte para `{id}` é o adaptador da API.

```ts
export const roleRoutes = {
  get: {
    method: "GET",
    path: "/roles/:id",
    tag: "Roles",
    auth: "bearer",                 // ou "public" — a rota que responde sem token
    summary: "Busca um papel por id — exige read:role",
    request: roleParamsSchema,      // envelope z.object({ body?, params?, query? })
    responses: {
      200: { description: "Papel encontrado", view: roleViews.default },
    },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
    },
  },
} as const satisfies RouteGroup;
```

O `as const` não é enfeite: é ele que faz `path`, `tag` e `summary` serem **literais** para quem
consome a tabela — sem ele `path` vira `string` e montar a URL de uma rota com `:param` sai do
alcance do compilador. `packages/api-contracts/tests/route-table.test.ts` não compila se um grupo
o perder.

Peças reutilizáveis (de `src/routes/responses.ts` e `src/pagination/list-envelope.ts`):
- **`view`** — a view do presenter. Uma listagem envolve a view num envelope:
  `offsetList(view)` (`?page=&limit=`), `cursorList(view)` (`?cursor=&limit=`) ou
  `staticList(view)` (coleção pequena, `meta {}`).
- **Escada de capability** — quando a **forma** da resposta muda com a feature efetiva de quem
  chama, `view` é o array dos degraus em ordem (`[productViews.public, …internal, …cost]`); o
  adaptador publica a união. Uma view só quando a forma é uma só.
- **`{ description }` sem `view`** — sucesso **204**; use a constante `noContent`.
- **`errorResponses[400|401|403|404|409|413|422|429|503]`** — o shape de erro por status; liste
  só os que a rota realmente devolve. Precisa de prosa própria num status? Espalhe a entrada e
  sobrescreva a `description` (é o que o 403 do login faz).
- **`upload: "image"`** — a rota recebe `multipart/form-data` com um arquivo em `file`. O
  formato aceito e o teto de tamanho são do servidor e ficam na API (`src/docs/components.ts`).

⚠️ O contrato **só depende de `zod`**. Se a rota parece precisar de `env`, Prisma ou Express
para ser declarada, a peça que precisa disso é do servidor — vá para `src/docs/components.ts`.

## 3. Registrar a rota na API — `registerRoute`

A entrada da tabela é a **fonte** também do lado do servidor: `registerRoute` deriva dela o
método, o path, o parse do envelope, o status de sucesso e a view aplicada à resposta. O
`*.routes.ts` do módulo não repete nada disso.

```ts
// src/modules/<mod>/<mod>.routes.ts
registerRoute(modRouter, routes.mod.get, {
  before: [authenticate, canAccess("read:mod")],
  handler: getMod,
});
```

- **O que é do servidor entra por `before`**, na ordem em que roda: `authenticate` /
  `optionalAuthenticate`, `canAccess`, `rateLimitByIp`, upload de imagem. A tabela não os
  conhece — ela descreve o contrato, não o servidor.
- **O controller vira o handler**: recebe `{ body, params, query, actor }` já validado e
  devolve o que a view descreve (ou nada, no 204). Ele não toca `res`, não chama `.parse()` e
  não escreve status. O tipo vem da própria entrada:
  `export const getMod: RouteHandler<typeof routes.mod.get> = …`.
- **O router do módulo é montado sem prefixo** em `src/routes/index.ts` (`v1Router.use(modRouter)`):
  o path inteiro vem da tabela, então um prefixo o duplicaria. O `authenticate` que ficava no
  prefixo desce para o `before` da rota.
- **A forma da resposta é da tabela; a decisão de quem vê o quê é da API.** O mascaramento de IP
  do audit log é o exemplo vivo: a view vem da entrada, o `maskIp` fica no módulo.

- **Escada de capability** — quando a entrada declara a escada (`view` é o array dos degraus),
  o registro diz **qual degrau cada ator recebe**, por `chooseView`. A tabela declara a escada;
  quem decide continua sendo a API, e um degrau de fora da escada declarada é 500, não resposta
  silenciosamente diferente.

```ts
registerRoute(userRouter, routes.user.get, {
  before: [authenticate, canAccess("read:user")],
  chooseView: chooseUserView,   // (actor) => a view daquele ator
  handler: getUserById,
});
```

Três desencontros o registrador recusa, no registro e com o par método + path na mensagem: mais
de um status de sucesso (ainda sem forma), escada sem `chooseView` e `chooseView` onde a entrada
declara uma view só.

> **Migração em curso (Fase 12).** O `registerRoute` convive com a forma antiga
> (`modRouter.get("/", middleware, controller)` + montagem com prefixo) até o último grupo de
> rotas migrar — ver `.scratch/fase-12-module-depth/issues/08-o-registrador-de-rota-e-o-grupo-piloto.md`.
> Rota nova nasce no registrador.

## 4. Se for um MÓDULO novo — ligar nas duas pontas

1. Criar `packages/api-contracts/src/routes/<mod>.routes.ts` exportando `<mod>Routes` e
   acrescentar a entrada em `src/routes/index.ts` (a ordem ali é a ordem dos paths no
   `/openapi.json`).
2. Se o módulo estreia uma **tag**: acrescentá-la em
   `packages/api-contracts/src/routes/route.tags.ts` (`ROUTE_TAGS`, na mesma ordem dos domínios)
   **e** a prosa dela em `TAG_DESCRIPTIONS`, em `apps/api/src/docs/openapi.ts`. A tag é do
   contrato, a prosa é do documento, e o `Record<RouteTag, string>` não compila se um dos dois
   faltar. **Os paths não são tocados**: `buildPathsFromRouteTable()` já os monta da tabela
   inteira.
3. Montar o router do Express no `src/routes/index.ts` da API — **sem prefixo**, se o módulo
   usa o `registerRoute` (§3). O `tests/unit/contracts/routeParity.test.ts` fica vermelho até os
   dois lados casarem — é ele que garante que o documento não descreve rota que não existe, nem
   esquece rota que existe.

## 5. Bruno (`api-collection/`) — manual

1. Criar `api-collection/<mod>/<Nome da Request>.bru` (uma pasta por módulo). Basear num `.bru` existente:
   ```
   meta { name: Get Role By Id
     type: http
     seq: 2 }
   get { url: {{baseUrl}}/roles/{{roleId}}
     body: none
     auth: inherit }        // herda o bearer {{accessToken}} da coleção
   ```
2. Se a request **produz** um id usado por outras (ex.: um create/list), capturar via `script:post-response` com **`bru.setVar(...)`** (runtime — **nunca** `bru.setEnvVar`, que gravaria no `.bru` versionado).
3. Se precisar de **variável nova** (novo id de path, etc.), declarar em `environments/local.bru` **e** `environments/prod.bru`.
4. Auth já vem por herança (`collection.bru` define bearer `{{accessToken}}`); o `Login` (pasta `auth/`) preenche o `accessToken`.

## 6. Fechar

- Atualizar o índice interno **`docs/reference/endpoints.md`** (1 linha por rota — não é OpenAPI, é o mapa rápido).
- `pnpm run typecheck` + `pnpm run lint` verdes. O `routeParity.test.ts` falha se a tabela e o router divergirem, e o `openapi.test.ts` falha se a doc vazar campo sensível ou se um path sumir — rodar a suíte.
- Conferir no ar (opcional): `pnpm run dev` → `GET /openapi.json` e `/reference` mostram a rota nova; validar o `.bru` com `@usebruno/cli` se quiser.

---

**Regra de ouro:** o contrato é o schema Zod mais a tabela de rotas. Se a doc de um endpoint parece exigir escrever OpenAPI à mão, provavelmente falta um `.meta()` num schema/view — ou um campo na entrada da tabela.

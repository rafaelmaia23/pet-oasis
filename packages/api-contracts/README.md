# `@pet-oasis/api-contracts`

O que atravessa a rede entre a API e os clientes (web hoje; mobile e back-office amanhã): os
schemas de request (create, update, query, path), as views de resposta, os enums de domínio,
os nomes de role e feature, a taxonomia de auditoria, a paginação, o shape de erro e a
**tabela de rotas** — o endereço de cada operação da API. **Só depende de `zod`.** Qualquer outro import é sinal de que a coisa não é contrato (Prisma,
Express, helper de servidor), e um teste do próprio pacote fica vermelho se isso acontecer.

A API não tem schema próprio nem tabela de paths própria: controllers, presenters e testes
importam daqui, e o `/openapi.json` é **derivado** da tabela de rotas por um adaptador
(`apps/api/src/docs/adapter.ts`). O que a API guarda é o que precisa de algo além de `zod` — o helper de
whitelist que aplica a view (`createPresenter`), a resolução de view por feature efetiva, a
derivação de slug, os helpers de paginação do repository, a máscara de IP do audit log — sempre
como composição por cima do schema do contrato.

## O que há aqui

| Entrada | Conteúdo |
|---|---|
| `@pet-oasis/api-contracts` | tudo abaixo, mais `DOMAIN_ENUMS` (o registro dos enums com dois donos) |
| `…/user` | `profileKindSchema`/`userStatusSchema`; peças de identidade (`emailSchema`, `cpfSchema`, `phoneSchema`, `passwordSchema` e os tetos); schemas de user e de perfil; `userViews` |
| `…/auth` | login, verificação, reset e troca de senha/email, reativação; `OPAQUE_TOKEN_LENGTH`; `accessTokenViews` (o `{ accessToken, expiresIn }` de login e refresh), `sessionViews` |
| `…/me` | `meViews` |
| `…/role` | `ROLE_NAMES`, `RoleName`, `roleNameSchema`; `roleParamsSchema`; `roleViews` |
| `…/feature` | `FEATURE_NAMES`, `FeatureName`, `featureNameSchema`, `PERMISSION_FEATURES`, `PRIVILEGED_FEATURES`; `featureParamsSchema`; `featureViews` |
| `…/permission` | params de role↔user e override; `userFeatureViews`, `effectiveFeaturesViews` |
| `…/pet` | `petSpeciesSchema`, `petSexSchema`; schemas de pet e de raça; `petViews`, `breedViews` |
| `…/catalog` | `productStatusSchema`; `catalogNameSchema`, `slugSchema`, `catalogDescriptionSchema`; schemas e views de marca, categoria (recursiva), tag, produto (escada `public`/`internal`/`cost`, detalhe × lista), variante e imagem; `MAX_IMAGES_PER_PRODUCT` |
| `…/audit-log` | `AUDIT_ACTIONS`, `AUDIT_TARGET_TYPES`; `listAuditLogsSchema`; `auditLogViews` |
| `…/log` | `listRecentLogsSchema`; `recentLogsViews` |
| `…/status` | `statusViews` (o health check) |
| `…/routes` | `routes` — a **tabela de rotas** (ver abaixo); `ROUTE_TAGS`/`RouteTag`, `errorResponses`, `noContent` e os tipos `RouteDefinition`/`RouteGroup`/`RouteTable` |
| `…/pagination` | `offsetQuerySchema`, `cursorQuerySchema`, `buildOffsetQuerySchema`, `defineSortConfig`, `offsetMetaSchema`, `cursorMetaSchema`, `DEFAULT_LIMIT`/`MAX_LIMIT`; os envelopes `offsetList`/`cursorList`/`staticList` |
| `…/errors` | `ERROR_CODES`/`ErrorCode` (folha `error.codes.ts`), `errorResponseSchema`, `validationErrorResponseSchema` e os tipos (folha `error.views.ts`) |

Cada domínio é uma entrada própria do `exports` para o consumidor importar só o que usa; o
índice reexporta tudo. Domínio novo = pasta nova em `src/` + entrada nova no `exports` + módulo
em `src/routes/` ligado no índice da tabela. Dentro
de um domínio, request vai em `*.schema.ts` e resposta em `*.views.ts`; enums e nomes vivem em
arquivos folha (`user.enums.ts`, `role.names.ts`, …) e **todo import entre domínios aponta para a
folha, nunca para o índice** — é o que impede um ciclo (`user → role → user`) de virar erro de
inicialização.

## A tabela de rotas

`routes.<domínio>.<operação>` é o endereço de **toda** operação da API, e o `/openapi.json` é
derivado dela — não existe segunda cópia. Cada entrada carrega o que um cliente precisa para
chamar a rota sem escrever nada à mão:

```ts
import { routes } from "@pet-oasis/api-contracts/routes";

routes.auth.login;
// {
//   method: "POST",
//   path: "/auth/login",          // forma do Express, relativa a /api/v1
//   tag: "Auth",
//   auth: "public",               // ou "bearer"
//   summary: "Login — retorna access token e seta o refresh cookie",
//   description: "Recusa em cinco condições, nesta ordem: …",
//   request: loginSchema,         // envelope z.object({ body?, params?, query? })
//   responses: { 200: { description: "Autenticado", view: accessTokenViews.default } },
//   errors: { 401: …, 403: …, 422: …, 429: … },   // shape de erro por status
// }
```

O que um cliente faz com isso, em ordem de utilidade:

- **Não digitar path.** `routes.product.get.path` é `/products/:idOrSlug`; trocar o path na API
  quebra o `typecheck` de quem o usa, em vez de virar 404 em produção.
- **Tipar os dois lados de uma chamada.** `z.infer<typeof routes.auth.login.request.shape.body>`
  é o corpo; `z.infer<(typeof routes.auth.login.responses)[200]["view"]>` é a resposta (o
  índice numérico pede o `typeof` entre parênteses).
- **Saber o que tratar.** `Object.keys(route.errors)` é a lista fechada de status que aquela
  rota devolve, cada um com o envelope que carrega (o 422 acrescenta `errors` por campo).
- **Decidir se precisa de token** antes de chamar: `route.auth === "public"`.

Duas coisas que a tabela **não** faz, de propósito:

- **Montar a URL.** Um `buildPath(route, params)` é do cliente: quem monta precisa decidir
  encoding, query string e base URL, e nada disso atravessa a rede. A tabela entrega o
  template; a substituição de `:id` é de quem chama.
- **Falar de multipart.** Uma rota de upload traz só `upload: "image"`. O formato aceito e o
  teto de tamanho são do servidor (vêm de env var) e vivem na API.

O path fica na forma do **Express** (`:id`) porque é assim que o `registerRoute` monta a rota
direto da entrada — o router não tem como divergir da tabela, já que ele é construído a partir
dela. O template `{id}` do OpenAPI sai do adaptador. Quando a forma da resposta muda com a feature efetiva de quem chama, `view` é a
**escada de capability** em ordem (`[público, interno, custo]`), e o adaptador a publica como
união. O racional está em
[`docs/adr/0003`](../../docs/adr/0003-route-table-is-contract-openapi-is-derived.md).

Os grupos são `as const`, então `path`, `tag` e `summary` são **literais**: quem monta a URL de
uma rota com `:param` faz isso sob o olho do compilador, e não sobre `string`.

### O que a tabela promete, provado aqui dentro

`tests/route-table.test.ts` percorre a tabela **uma vez** e prova, como função pura — sem
Postgres e sem aplicação de pé —, o que antes só falharia por HTTP:

- todo `:param` do path tem chave no `params` do request, e toda chave de `params` tem `:param`
  no path (um `:param` sem chave chega ao handler sem validação; uma chave sem `:param` é
  validação que nunca roda);
- o envelope de request só usa `body`, `params` e `query` — uma quarta chave é ignorada pelo
  adaptador, então ela é vermelho aqui;
- as tags usadas são exatamente as de `ROUTE_TAGS`, na ordem em que a tabela as apresenta;
- cada **escada** de views é contida — o degrau de cima tem todo campo do de baixo, inclusive
  dentro de objeto e de array aninhados. É a premissa de o adaptador emitir `anyOf` em vez de
  `oneOf`.

As **tags** moram em `src/routes/route.tags.ts` e são o tipo do campo `tag`: usar uma tag fora
da lista não compila. A prosa que descreve cada grupo continua na API — `openapi.ts` declara um
`Record<RouteTag, string>`, então descrever uma tag que a tabela não usa, ou esquecer de
descrever uma que ela usa, também não compila. Os dois sentidos ficam amarrados sem o documento
e a tabela se repetirem.

`tests/purity.test.ts` cuida da forma do pacote: além da pureza (só `zod`), prova que o
`exports` do manifesto lista exatamente os índices que existem em `src/` e que **import entre
domínios aponta para a folha, nunca para o índice** do outro domínio — é o que impede um ciclo
(`user → role → user`) de virar `undefined` na inicialização do consumidor.

## Consumido do fonte TS, sem build

O `exports` aponta para `src/**/*.ts`, não para um `dist/`. É o padrão que o Turborepo chama
de *just-in-time package*: quem compila o contrato é o consumidor, com o próprio toolchain.
Todos os consumidores do workspace já compilam TypeScript — o tsup/esbuild que bundla a API, o
`tsx watch` do container de dev, o Vite por baixo do Vitest e o Next (com
`transpilePackages: ["@pet-oasis/api-contracts"]`, a única configuração que o web precisa —
mais `zod` como dependência direta dele, porque o web escreve `z.infer` sobre estes schemas).

Isso deixou de ser expectativa na 11.12, quando o web passou a consumir o pacote de fato:
`next build` e `tsc` do web compilam o fonte do contrato. A medida que surpreendeu está
anotada no `next.config.ts` do web — o Turbopack do Next 16 compila o pacote **mesmo sem**
`transpilePackages`; a linha fica porque é ela que fixa o comportamento, e porque é no bundle
de servidor que depender do acaso custaria caro (pacote externalizado vira `require()` de um
`.ts` em runtime).

O que se ganha: nenhum passo de build entre editar o contrato e vê-lo no consumidor, nenhum
`dist/` obsoleto para o IDE resolver por engano, `turbo.jsonc` sem task de build para o pacote,
e o Dockerfile da API não muda — o `COPY packages packages` que já existia entrega o fonte.

O que se paga, e onde está pago:

- **O tsup externaliza toda `dependency` por padrão.** Um `import` do contrato deixado no
  `dist/server.js` apontaria para um `.ts` e só rodaria pelo type stripping do Node — frágil
  demais para produção. Por isso o `tsup.config.ts` da API tem
  `noExternal: ["@pet-oasis/api-contracts"]`: o pacote é inlinado no bundle, e o `zod` que ele
  importa continua externo, porque é dependência da própria API. O `pnpm deploy --prod` ainda
  materializa o pacote em `node_modules` da imagem (é `dependency`), mas o bundle não o lê.
- **Cada consumidor typechecka o fonte do contrato com o próprio `tsconfig`.** A garantia de
  que ele compila sob o preset mais estrito do workspace vem do `typecheck` **deste** pacote,
  que roda sob `tsconfig.library.json` (só `esnext`, sem DOM nem Node) — um `Buffer` ou
  `window` que escapasse para cá chegaria ao web por arrasto. Os testes precisam do Node (a
  guarda de pureza lê `src/` pelo filesystem) e têm o próprio programa, `tsconfig.test.json`.
- **Se um dia um consumidor não compilar TS** (uma ferramenta que só lê `.js`/`.d.ts`), o
  pacote ganha build e o `exports` passa a apontar para `dist/`. O `turbo.jsonc` já declara
  `typecheck` e `build` atrás de `^build`, então a ordem está pronta — o que muda é o
  `package.json` daqui e uma linha no estágio `build` do Dockerfile da API (buildar o contrato
  antes do tsup).

## Enums têm dois donos, com prova

O Prisma continua dono do banco; o contrato é dono do que atravessa a rede. Cada enum é
declarado duas vezes de propósito, e um teste na API (`tests/unit/contracts/enumParity.test.ts`)
percorre `DOMAIN_ENUMS` e compara os `.options` de cada `z.enum` com os valores do enum gerado
pelo Prisma de mesmo nome. Um valor a mais ou a menos de qualquer lado, um enum novo no
`schema.prisma` sem entrada aqui (ou sem ser declarado interno lá), um enum novo aqui sem par no
Prisma — tudo é teste vermelho, não bug em produção.

## Scripts

```bash
pnpm --filter @pet-oasis/api-contracts typecheck   # src como biblioteca + tests como Node
pnpm --filter @pet-oasis/api-contracts lint
pnpm --filter @pet-oasis/api-contracts test        # pureza e forma do pacote, invariantes da tabela de rotas, shape de erro, registro de enums, paginação, audit
```

Os três também rodam pelo Turbo da raiz (`pnpm typecheck`, `pnpm lint`, `pnpm test`).

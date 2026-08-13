# Documentar um endpoint/módulo novo (OpenAPI + Scalar + Bruno)

> Checklist do que fazer, além do código, sempre que nascer um endpoint ou módulo novo, para ele aparecer no `/openapi.json`, na UI `/reference` (Scalar) e na coleção Bruno. A fonte da doc são os **próprios schemas Zod** — nada de escrever OpenAPI à mão.

O `/reference` (Scalar) só consome o `/openapi.json`; então **documentar o OpenAPI já cobre o Scalar**. Sobra o Bruno, que é manual. São 3 frentes: schemas → path → Bruno.

---

## 1. Anotar os schemas Zod com `.meta()`

Zod 4 nativo (sem monkey-patch). O `.meta()` alimenta `description`/`example` e nomeia componentes.

- **Request** (`src/modules/<mod>/<mod>.schema.ts`): `.meta({ example })` nos campos que ajudam a entender o corpo/params. Manter a convenção do envelope `z.object({ body?, params?, query? })` — é dela que o helper extrai as partes (§2).
- **Response / views** (`src/modules/<mod>/<mod>.presenter.ts`): dar `.meta({ id, description })` na view — o `id` vira o **nome do componente** no OpenAPI (ex.: `Role`, `UserOwner`). Campos com `.meta({ example })`.
- ⚠️ **Segurança grátis:** a view é uma *whitelist* (`.parse()` derruba o resto), então o exemplo de response nunca vaza `passwordHash`/`tokenHash`/etc. Não documente response por um schema cru do banco — sempre pela view do presenter.

```ts
// presenter.ts
const defaultView = z.object({
  id: z.uuid(),
  name: z.string().meta({ example: "manager" }),
}).meta({ id: "Role", description: "Papel do sistema" });
```

## 2. Registrar o path em `src/docs/paths/<mod>.ts`

Uma entrada por rota, no objeto `<mod>Paths` (tipo `ZodOpenApiPathsObject`). Path param vai como `{id}` (chaves), não `:id`.

```ts
export const rolePaths: ZodOpenApiPathsObject = {
  "/roles/{id}": {
    get: {
      tags: ["Roles"],
      summary: "Busca um papel por id — exige read:role",
      ...fromEnvelope(roleParamsSchema),        // params/query/body do envelope
      responses: {
        200: jsonResponse("Papel encontrado", roleViews.default),
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
      },
    },
  },
};
```

Peças reutilizáveis (de `src/docs/components.ts` e `helpers.ts`):
- **`fromEnvelope(schema)`** — extrai `params → path`, `query → query`, `body → requestBody` do envelope. Só emite o que existir; use quando a rota tem params/query/body.
- **`jsonResponse(desc, schema)`** — resposta com corpo JSON (passar a **view**, ou `z.array(view)` para listas).
- **`errorResponses[400|401|403|404|409|422]`** — respostas de erro padrão; liste as que a rota realmente pode retornar.
- **`noContentResponse`** — para sucesso **204** (sem corpo).
- **Rota pública** (sem token): adicionar `security: []` na operação (o default do documento é `bearerAuth`). Ex.: tudo em `/auth`.

## 3. Se for um MÓDULO novo — ligar no documento

1. Criar `src/docs/paths/<mod>.ts` exportando `<mod>Paths`.
2. Em `src/docs/openapi.ts`: **importar** e dar **spread** em `paths: { ... }`, e acrescentar uma entrada em `tags: [...]` (a tag usada nas operações).

## 4. Bruno (`api-collection/`) — manual

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

## 5. Fechar

- Atualizar o índice interno **`docs/reference/endpoints.md`** (1 linha por rota — não é OpenAPI, é o mapa rápido).
- `npm run typecheck` + `npm run lint` verdes. O `openapi.test.ts` roda em `npm test` e falha se a doc vazar campo sensível ou se um path sumir — rodar a suíte.
- Conferir no ar (opcional): `npm run dev` → `GET /openapi.json` e `/reference` mostram a rota nova; validar o `.bru` com `@usebruno/cli` se quiser.

---

**Regra de ouro:** o contrato é o schema Zod. Se a doc de um endpoint parece exigir escrever OpenAPI à mão, provavelmente falta um `.meta()` num schema/view.

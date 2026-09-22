# A tabela de rotas é contrato, e o `/openapi.json` é derivado dela

> Decisão de sistema, tomada na Fase 11 e executada na issue 17
> (`.scratch/fase-11-monorepo/issues/17-route-table-in-the-contract.md`). Vale para a fronteira
> entre a API e qualquer cliente dela. O *o que é contrato* já estava decidido em
> [`apps/api/docs/adr/0199`](../../apps/api/docs/adr/0199-schemas-de-request-e-views-sao-codigo-do-contrato.md)
> para schemas e views; esta estende a mesma regra ao endereço das rotas.

Depois da Fase 11 os schemas de request e as views de resposta já viviam em
`packages/api-contracts`, mas o **endereço** de cada operação não: ele existia duas vezes, no
router do Express e em `apps/api/src/docs/paths/*.ts`, e uma terceira vez em cada cliente, que
montava `"/auth/login"` à mão. As três cópias não tinham nada que as mantivesse iguais — trocar
um path no router deixava o `/openapi.json` mentindo, e o web só descobria em runtime.

**Decidimos** que a tabela de rotas é parte do contrato: `packages/api-contracts/src/routes/`,
um módulo por domínio agregado num índice, entrada aninhada por domínio e nomeada pela operação
(`routes.auth.login`, `routes.product.list`). Cada entrada carrega o método, o path **na forma
do Express** (`/users/:id`), o schema de request do próprio contrato, a resposta por status, o
shape de erro por status, se a rota é pública ou exige bearer, e a prosa que antes só o OpenAPI
carregava. O pacote continua dependendo só de `zod`.

O `/openapi.json` passa a ser **derivado**: `apps/api/src/docs/adapter.ts` converte `:id` →
`{id}`, envelope → `parameters`/`requestBody`, escada de views → união e
`<domínio>.<operação>` → `operationId`. Na API sobra só o que é do servidor — o corpo
multipart dos uploads e o teto de tamanho, os security schemes, os `servers`, a prosa do
documento e o bundle do Scalar. Quem prova que a tabela e o router não divergiram é
`apps/api/tests/unit/contracts/routeParity.test.ts`, que compara os pares `método + path` dos
dois lados; quem prova que o documento não mudou de forma é o `openapi.test.ts`, que passa sem
edição.

**O path fica na forma do Express, e não no template do OpenAPI**, porque é o router que é
comparado com a tabela: normalizar de um lado só esconderia justamente o erro de digitação que
a comparação existe para pegar. **Montar a URL é do cliente**, não do contrato — um `buildPath`
precisa decidir encoding, query string e base URL, e nada disso atravessa a rede. E a escada de
capability vira `anyOf`, não `oneOf`: os degraus se contêm, e `oneOf` acusaria como inválido o
corpo que a API realmente devolve.

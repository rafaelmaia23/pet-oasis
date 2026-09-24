# A entrada da tabela de rotas constrói o handler; o teste de paridade morre

`docs/adr/0003-route-table-is-contract-openapi-is-derived.md` já dizia que a tabela de rotas é o
contrato e o `/openapi.json` um adapter derivado dela — mas era o único adapter: o router do
Express era montado à mão em cada `*.routes.ts`, redeclarando método, path, schema de request
(69 chamadas de `.parse()`), status de sucesso e view. A única prova de que as duas declarações
concordavam era `routeParity.test.ts`, um teste unitário que fazia monkey-patch de
`Router.prototype.use` para reconstruir, em runtime, o par `MÉTODO path` de cada lado e compará-los.

`registerRoute` (`apps/api/src/lib/registerRoute.ts`) é o segundo adapter: recebe a entrada da
tabela e o handler, e deriva dela o path, o parse do envelope, o status de sucesso e a view — o
handler recebe o request já validado e devolve dado (ou nada, no 204), sem tocar `req`/`res`. O que
é do servidor (`authenticate`, `canAccess`, rate limit, upload) entra por parâmetro (`before`); o
que o transporte sabe e a tabela não descreve (cookie, user agent, IP) entra por `context`, uma
função do próprio módulo. Com as 79 rotas de domínio migradas (Fase 12, `.scratch/fase-12-module-depth/`,
um commit por rota) não sobra forma antiga: uma rota nova só pode nascer na tabela.

O teste de paridade **saiu inteiro** (issue 15) — não foi substituído por outro teste de
concordância, porque deixou de haver o que concordar: o router é **construído** a partir da tabela,
então divergir as duas é sintaticamente impossível. O único invariante que ele provava e que não
ficou tautológico — "a tabela não repete o par método + path" — migrou para
`packages/api-contracts/tests/route-table.test.ts`, uma função pura sobre a tabela, sem Express e
sem monkey-patch.

# 15: A forma velha de registrar rota sai (contract)

**What to build:** o repo deixa de ter duas maneiras de registrar uma rota. Com as 79 rotas já sob o
registrador, a forma antiga não tem mais caller — e o teste de paridade que compara `MÉTODO path`
entre contrato e router deixa de ser load-bearing: a concordância passou a ser estrutural, não
vigiada por monkey-patch do router do Express.

**Blocked by:** 09, 10, 11, 12, 13, 14.

**Status:** fechada em 2026-09-24

O que de fato ficou pronto:

- [x] Busca confirmou zero `router.<verbo>(` fora do `registerRoute` em `src/modules/**` — as 79
      rotas de domínio (auth, brand, category, tag, status, role, permission, me, breed, feature,
      log, audit-log, pet, product, product.variant, user, user.profile) só chamam
      `registerRoute`. Sobram dois `router.get(...)` crus em `src/routes/index.ts`
      (`/openapi.json`, o bundle do Scalar) — não são rota de domínio, não têm entrada na tabela do
      contrato (não há o que registrar) e já tinham teste de integração próprio antes desta issue;
      viraram a exceção explícita, comentada no próprio arquivo, em vez de ficarem implícitas.
- [x] `src/routes/index.ts` perdeu o comentário sobre as duas formas convivendo — todo router
      montado em `v1Router` já é seco (sem prefixo).
- [x] `apps/api/tests/unit/contracts/routeParity.test.ts` foi removido inteiro — o monkey-patch de
      `Router.prototype.use` (`loadRouterWithMounts`) morreu junto, por estar dentro do próprio
      arquivo, não numa dependência à parte.
- [x] O único invariante do teste de paridade sem outra prova — "não repete o par método + path na
      tabela" — migrou para `packages/api-contracts/tests/route-table.test.ts` (issue 02). Os
      demais (conjunto não vazio, cada par presente nos dois lados) ficaram tautológicos com o
      router construído a partir da tabela, e saíram sem substituto. A checagem "nada fora de
      `/api/v1` além de `SERVER_ROUTES`" também saiu sem substituto automático — dito em voz alta
      aqui: `/openapi.json` e o bundle do Scalar continuam provados por
      `tests/integration/v1/openapi.test.ts` e `tests/integration/v1/reference.test.ts`
      (existência e conteúdo), só que uma terceira rota-fantasma futura em `routes/index.ts`
      deixou de ter um teste que a pega — vira responsabilidade de revisão, não de suíte.
- [x] `apps/api/CLAUDE.md`: "Arquitetura — camadas" parou de falar em forma antiga convivendo;
      "Organização de módulos" parou de listar `*.presenter.ts` como parte de todo módulo (agora
      diz que a maioria não tem nenhum, com os três sobreviventes por conteúdo — `audit-log`,
      `product`, `user`) e parou de citar o `routeParity.test.ts` como prova; "Validação" trocou
      "sintática (Zod, sem banco) no controller" por "pelo `registerRoute`, que faz o `.parse()` do
      envelope antes de chamar o handler". Mesma limpeza propagada para
      `apps/api/docs/guides/documenting-endpoints.md`, `docs/adr/0003`,
      `packages/api-contracts/README.md` e o comentário de
      `packages/api-contracts/src/routes/route.types.ts` (todo lugar que citava o arquivo
      removido como prova).
- [x] Suíte (86 arquivos, 1428 testes), `typecheck`, `lint` e `docs:check` verdes.

**Achado à parte, fora do escopo desta issue:** a issue 12 (`.scratch/fase-12-module-depth/issues/12-rotas-de-pet.md`)
está com `Status: ready-for-agent` e as caixas desmarcadas, mas o merge dela (`8cf95ac`) já está em
`fase-12-module-depth` e o código (`pet.routes.ts`) já está inteiro no registrador — parece só a
atualização de fechamento que faltou. Não corrigido aqui para não misturar o escopo desta issue;
fica registrado para quem tocar a issue 12 de novo.

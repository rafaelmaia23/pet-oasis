# 17: A tabela de rotas é contrato, e o OpenAPI é derivado dela

**What to build:** um cliente do contrato chama qualquer endpoint da API sem escrever um path
à mão: `routes.<domínio>.<operação>` (por exemplo `routes.auth.login`, `routes.product.list`)
dá método, path, schema de request, respostas por status, shape de erro por status, se a rota é
pública ou exige bearer, e a prosa que hoje só o OpenAPI carrega. A API deixa de ter uma segunda
cópia dessa tabela: o `/openapi.json` é **derivado** dela por um adaptador, e um teste de
paridade garante que o router e a tabela nunca divergem. É a peça 1 da issue `00` da Fase 12,
feita de uma vez para os 16 domínios (refactor largo, sem duas fontes de verdade convivendo).

**Blocked by:** 16.

**Status:** ready-for-agent

- [ ] Teste de paridade primeiro, na API, ao lado do de enums: o conjunto `method + path` do
      router stack do Express é igual ao conjunto da tabela do contrato; rota sem entrada ou
      entrada sem rota é vermelho com o par faltante no nome. O path na tabela é o do Express
      (`:id`), para que a comparação não normalize nada.
- [ ] A tabela vive no contrato, um módulo por domínio agregado num índice, entrada aninhada
      por domínio e nomeada pela operação, com: `method`, `path`, o schema de request do
      próprio contrato (envelope `body`/`query`/`params`), respostas por status — uma view, ou
      a lista de views na ordem da escada de capability —, o shape de erro por status, a
      exigência de auth (pública ou bearer), `summary`, `description` e a descrição de cada
      resposta. Só-zod: a pureza do pacote continua verde.
- [ ] O `src/docs/` da API é só adaptador: converte `:id` → `{id}`, lista de views → `oneOf`,
      nome da operação → `operationId`, o envelope → parâmetros/body, e monta o documento. Nenhum
      path, schema ou prosa de rota é declarado na API; o que sobra lá é o que é do servidor
      (upload multipart e limites, security schemes, servers, o bundle do Scalar).
- [ ] O teste de integração do `/openapi.json` e a suíte HTTP inteira continuam verdes **sem
      edição** — é o oráculo de "o documento e o router não mudaram".
- [ ] `CONTEXT-MAP.md` acrescenta a tabela de rotas ao que o contrato exporta; README do
      contrato descreve a tabela e o que um cliente faz com ela (um `buildPath` é do cliente,
      não do contrato); o guia de integração aponta para a tabela como a fonte dos paths.
- [ ] O `typecheck` do web passa importando a tabela de rotas e a view de sessão do contrato
      (a issue 12 é quem faz o smoke completo).
- [ ] Suíte, `typecheck`, `lint` e `docs:check` verdes.

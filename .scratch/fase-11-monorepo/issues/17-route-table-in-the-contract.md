# 17: A tabela de rotas é contrato, e o OpenAPI é derivado dela

**What to build:** um cliente do contrato chama qualquer endpoint da API sem escrever um path
à mão: `routes.<domínio>.<operação>` (por exemplo `routes.auth.login`, `routes.product.list`)
dá método, path, schema de request, respostas por status, shape de erro por status, se a rota é
pública ou exige bearer, e a prosa que hoje só o OpenAPI carrega. A API deixa de ter uma segunda
cópia dessa tabela: o `/openapi.json` é **derivado** dela por um adaptador, e um teste de
paridade garante que o router e a tabela nunca divergem. É a peça 1 da issue `00` da Fase 12,
feita de uma vez para os 16 domínios (refactor largo, sem duas fontes de verdade convivendo).

**Blocked by:** 16.

**Status:** fechada em 2026-09-22

> A escada de capability foi aplicada às 10 rotas em que a API já resolve a view pela feature
> efetiva do ator (produto: detalhe, criação e atualização;
> variante: criação e atualização; usuário: criação, leitura e atualização; perfil: criação de
> customer e de employee) — decisão do dono do projeto, tomada durante a execução. O
> `/openapi.json` passa a publicar a união nessas 10 e ganha `operationId` nas 79 operações;
> nada mais do documento mudou (diff estrutural conferido contra o documento anterior).

- [x] Teste de paridade primeiro, na API, ao lado do de enums: o conjunto `method + path` do
      router stack do Express é igual ao conjunto da tabela do contrato; rota sem entrada ou
      entrada sem rota é vermelho com o par faltante no nome. O path na tabela é o do Express
      (`:id`), para que a comparação não normalize nada.
- [x] A tabela vive no contrato, um módulo por domínio agregado num índice, entrada aninhada
      por domínio e nomeada pela operação, com: `method`, `path`, o schema de request do
      próprio contrato (envelope `body`/`query`/`params`), respostas por status — uma view, ou
      a lista de views na ordem da escada de capability —, o shape de erro por status, a
      exigência de auth (pública ou bearer), `summary`, `description` e a descrição de cada
      resposta. Só-zod: a pureza do pacote continua verde.
- [x] O `src/docs/` da API é só adaptador: converte `:id` → `{id}`, lista de views → `oneOf`,
      nome da operação → `operationId`, o envelope → parâmetros/body, e monta o documento. Nenhum
      path, schema ou prosa de rota é declarado na API; o que sobra lá é o que é do servidor
      (upload multipart e limites, security schemes, servers, o bundle do Scalar).
      **Desvio consciente:** a escada sai como `anyOf`, não `oneOf` — os degraus se contêm, e
      `oneOf` exigiria casar com exatamente um, acusando como inválido o corpo que a API
      devolve. O racional está no `docs/adr/0003` e no cabeçalho de `src/docs/adapter.ts`.
- [x] O teste de integração do `/openapi.json` e a suíte HTTP inteira continuam verdes **sem
      edição** — é o oráculo de "o documento e o router não mudaram".
- [x] `CONTEXT-MAP.md` acrescenta a tabela de rotas ao que o contrato exporta; README do
      contrato descreve a tabela e o que um cliente faz com ela (um `buildPath` é do cliente,
      não do contrato); o guia de integração aponta para a tabela como a fonte dos paths.
- [x] O `typecheck` do web passa importando a tabela de rotas e a view de sessão do contrato
      (a issue 12 é quem faz o smoke completo) — verificado com a dependência e um módulo
      importando `routes` e `sessionViews` postos e desfeitos no mesmo passo (`tsc --noEmit`
      do web verde); a fiação permanente é da issue 12.
- [x] Suíte, `typecheck`, `lint` e `docs:check` verdes.

# 02: Invariantes da tabela de rotas provados no pacote que a possui

**What to build:** quem mexe na tabela de rotas descobre um erro de forma na hora, rodando os testes
do pacote do contrato — sem Postgres, sem subir a aplicação. Hoje a maior e mais nova parte do
contrato não tem teste nenhum no pacote dela: o que existe é um teste unitário na API que faz
monkey-patch do router do Express e um de integração que sobe a aplicação inteira. E `path` é
`string` em vez de literal, o que deixa exatamente a montagem de URL fora do alcance do compilador.

**Blocked by:** None (can start immediately).

**Status:** fechada em 2026-09-23

O que de fato ficou pronto — onde divergiu do plano, o porquê está ao lado:

- [x] Os 18 grupos passaram a `as const satisfies RouteGroup`. O `typecheck` do monorepo inteiro
      (contrato, API e web) segue verde: o adaptador do OpenAPI lê a tabela por `Object.entries` e
      `readonly` não o alcança. A prova é de **tipo**, não de runtime, e vale para a **tabela
      inteira**: `NonLiteralEntries` em `tests/route-table.test.ts` é `never` enquanto todo grupo
      mantiver o `as const`, e vira o nome da entrada culpada quando um perde (verificado tirando o
      `as const` de um grupo que o teste nem cita: `TS2322`).
      **Divergência do pedido:** a checagem cobre `path` e `tag`, não `summary`. Catorze entradas
      escrevem a prosa como `"…" + "…"` para caber na coluna, e o TypeScript alarga a soma de dois
      literais para `string` — o `as const` está lá, mas o literal não sobrevive à concatenação.
      Quebrá-las em linha única daria um literal que nenhum consumidor usa; quem monta URL precisa
      de `path`, quem agrupa a referência precisa de `tag`.
- [x] `packages/api-contracts/tests/route-table.test.ts`: uma travessia só da tabela, lida por todos
      os `it`. Todo `:param` do path tem chave no `params` do request — e, **acrescentado ao
      pedido**, também o contrário (chave de `params` sem `:param` no path é validação que nunca
      roda; hoje os dois sentidos já passavam).
- [x] O envelope de request só usa `body`, `params` e `query`; uma quarta chave é vermelho
      (verificado acrescentando `headers` numa rota).
- [x] As tags viraram declaração: `src/routes/route.tags.ts` traz `ROUTE_TAGS`/`RouteTag`, e `tag`
      passou a ser tipado por ele — tag fora da lista não compila. O teste prova que a tabela usa
      exatamente essas, na ordem em que as apresenta. **O outro sentido ficou no typecheck da API**,
      não num teste do contrato: `apps/api/src/docs/openapi.ts` declara
      `TAG_DESCRIPTIONS: Record<RouteTag, string>` e monta `tags` a partir de `ROUTE_TAGS`, então
      descrever uma tag que não existe, ou esquecer de descrever uma que existe, não compila. Foi a
      forma de fechar os dois sentidos sem o contrato importar a API (pureza) e sem mover a prosa da
      referência para o contrato — que seria decisão de fronteira, não desta issue. O documento
      emitido não mudou: `buildOpenApiDocument().tags` foi comparado, antes × depois, e saiu
      idêntico.
- [x] A escada de views é provada contida, e **em profundidade**: todo campo do degrau de baixo
      existe no de cima inclusive dentro de objeto e de array aninhados (é o que pega o custo da
      variante, que mora em `variants[]`). É a premissa de o adaptador emitir `anyOf` em vez de
      `oneOf`. Verificado invertendo um degrau: vermelho apontando o campo perdido.
- [x] A violação de import entre domínios era `src/routes/responses.ts → ../errors/index`. O
      domínio `errors` era um `index.ts` com conteúdo, sem folha para onde apontar: virou
      `error.codes.ts` (o vocabulário — `ERROR_CODES`, `ErrorCode`, `errorCodeSchema`) +
      `error.views.ts` (o envelope), com o `index.ts` reduzido a barril. A entrada
      `@pet-oasis/api-contracts/errors` não mudou, então nenhum consumidor foi tocado. A regra virou
      teste em `tests/purity.test.ts` ("forma do pacote").
- [x] O `exports` do manifesto é comparado com os diretórios de `src/` nos dois sentidos, e cada
      alvo publicado tem de existir em disco — uma entrada que não resolve só apareceria no
      consumidor.
- [x] Nenhum teste foi apagado. A suíte do contrato foi de 50 para 58 testes (6 arquivos → 7); a
      suíte da API continua inteira e verde (79 arquivos, 1367 testes), rodada contra um Postgres e
      um Redis próprios desta worktree para não disputar o banco de teste com outro agente.

A revisão (`code-review`, eixos Standards e Spec) apontou seis coisas, todas endereçadas: o guia
`apps/api/docs/guides/documenting-endpoints.md` ensinava a forma velha (`} satisfies RouteGroup` e
`tags: [...]` no `openapi.ts`) e foi atualizado; a prova de literal cobria 2 entradas de 79 e passou
a cobrir a tabela inteira; o `it` que "percorria um por domínio" era tautológico e virou "não deixa
domínio sem operação"; a escada passava vacuamente para degrau que não fosse objeto e agora exige
que cada degrau seja um; `unwrap` ignorava `.default()`/`.readonly()`, que pulavam a subárvore; e a
regra de folha não pegava a forma de diretório (`from "../errors"`), que o Node resolve para o mesmo
índice — pega agora, com o índice do pacote (`src/index.ts`, o barril dos barris) isento.

O README do pacote ganhou a seção "O que a tabela promete, provado aqui dentro" e as linhas de
`ROUTE_TAGS` e das folhas de `errors`. Nenhum ADR novo: a tabela ser a fonte e o documento ser
derivado dela já é `docs/adr/0003-route-table-is-contract-openapi-is-derived.md`, e o que esta
issue fez foi honrá-lo.

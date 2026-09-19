# SQL cru vive exclusivamente no repository

> Decisão migrada em 2026-09-18 do contexto temático da API (**Arquitetura** › *Onde cada coisa vive*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Via `$queryRaw` com template parametrizado — nunca concatenação, nunca fora dessa camada. O corte
de camadas se mantém mesmo quando a ferramenta é SQL puro. São **três** pontos, e cada um existe
porque o Prisma não expressa o que se precisa:

1. a busca textual (`tsvector`/`pg_trgm`, 9.9 — ver [`0009-text-search.md`](0009-text-search.md));
2. o lock que serializa a atribuição de posição das imagens de produto (9.10);
3. o lock que serializa a exclusão da última variante ativa (9.12).

Os dois últimos são o mesmo remédio — `SELECT id FROM products WHERE id = $1 FOR UPDATE` — para o
mesmo padrão: uma leitura que decide um invariante, seguida da escrita que o preserva. Não existe
como pedir lock de linha pela API do Prisma sem inventar uma coluna só para isso. Ponto novo é
decisão a justificar, não rotina.

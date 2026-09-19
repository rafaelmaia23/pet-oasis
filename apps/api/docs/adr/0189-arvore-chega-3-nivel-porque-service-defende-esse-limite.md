# A árvore chega ao 3º nível porque o service defende esse limite

> Decisão migrada em 2026-09-18 do contexto temático da API (**Domínio pet shop** › *Dataset fake do domínio (9.11)*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

A 9.6 validou profundidade máxima 3 no `category.service`. Uma árvore de dois níveis nunca
exercitaria o limite que o código defende, então dois ramos vão fundo de propósito
(`Alimentação > Ração > Ração seca` e `Higiene e Beleza > Banho > Shampoo`). Espécie continua
**faceta** (`Product.targetSpecies`), nunca nível da árvore — a categoria modela função.

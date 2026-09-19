# O recorte da Fase 9 (a única decisão que não tem ADR)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Domínio pet shop**), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

**Bloco A (pets) + Bloco B (catálogo), sem checkout.** Dos três recortes avaliados, "só pets"
ficava magro demais para o marco que o README anuncia ("o Ciclo 2 abre o domínio do pet shop"), e
"loja virtual completa" (pets + catálogo + carrinho + pedido) foi recusado porque o pedido depende
de estoque, que depende de variante, que depende de preço — uma cadeia longa demais para descobrir
um erro de modelagem só no fim. As duas agregações entregues se tocam **apenas** na faceta "para
qual espécie este produto serve", o que permite trabalhá-las em sequência sem que uma trave a
outra. Carrinho, pedido e pagamento ficam para a Fase 10.

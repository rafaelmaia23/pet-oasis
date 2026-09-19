# A recusa de slug com forma de UUID vale também para o derivado

> Decisão migrada em 2026-09-18 do contexto temático da API (**Domínio pet shop** › *O que o fecho da fase (9.12) corrigiu no catálogo*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

A Y2 recusava slug **explícito** parecido com id, porque `GET /products/:idOrSlug` desempata
pela forma do valor. O slug derivado do nome não passava por essa recusa: um produto batizado
com algo que slugifica para um UUID nasceria inalcançável por slug para sempre, e a leitura
não tem como consertar o que já está no banco.

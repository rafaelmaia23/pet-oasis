# Duas estratégias, um envelope só

> Decisão migrada em 2026-09-18 do contexto temático da API (**Contratos de API** › *Paginação*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

**Offset** para listas de CRUD (com `total` e salto para página arbitrária) e **cursor/keyset** para
listas append-only ordenadas por tempo, onde offset pula e repete registros sob escrita concorrente.
Naturezas diferentes, ferramentas diferentes — mas **todas** as listagens devolvem `{ data, meta }`,
inclusive as que não paginam, para o cliente ter contrato único e para paginar uma delas amanhã ser
aditivo em vez de breaking.

Exceção: `GET /users/:userId/permissions` segue `string[]` cru (é um conjunto de capacidades
computado, não uma coleção de recursos).

O **tiebreaker por `id`** na chave do cursor é obrigatório: sem ele, dois registros com o mesmo
timestamp fazem a borda da página pular ou repetir. Limites e alternativas no ADR
[`0004-pagination.md`](0004-pagination.md).

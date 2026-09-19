# Ordenação configurável só no offset

> Decisão migrada em 2026-09-18 do contexto temático da API (**Contratos de API** › *Paginação*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

`?sort=<campo>&order=asc|desc` (Fase 9.2) existe **só na paginação por offset**: no cursor a chave
teria que codificar o próprio campo de ordenação, e a limitação segue registrada no backlog.

Cada recurso declara uma **allowlist** que é um mapa *campo → direção natural* — campo fora dela
morre em **422**, e nome nenhum vindo do request alcança o `orderBy` do Prisma. A direção natural é
o que responde `?sort=` sem `?order=` (data desce, texto sobe), de modo que `?sort=createdAt` não
inverte a listagem em relação a não mandar parâmetro. `?order=` sem `?sort=` é **422** nomeando
`order`: o default do recurso não é um alvo implícito. O **tiebreaker por `id`** passou a ser
obrigatório também no offset, seguindo a direção pedida — a mesma lição do cursor, que o `GET /users`
ainda não tinha. Decisões e forma no código no adendo do ADR
[`0004-pagination.md`](0004-pagination.md).

# `GET /me`

> Decisão migrada em 2026-09-18 do contexto temático da API (**Contratos de API** › *Views (presenter)*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Exige a feature `read:user` (mesmo padrão de `GET /users/:id`); perfil soft-deletado aparece como
`null` (não sobe perfil morto); roles aninhadas dentro de `customer`/`employee` em shape enxuto
(`{id,name,description,appliesTo}`, sem features aninhadas — as capacidades já estão cobertas pelo
`features` efetivo do topo).

**O id de perfil entrou na 9.4** (`customer.id`/`employee.id`, aqui e na view `owner` de user).
Não é cosmético: a coleção de pets é aninhada em `/customers/:customerId/pets`, e a decisão de
**não** ter `/me/pets` (`docs/reference/backlog.md`) se apoiava explicitamente em "o `GET /me` já
devolve `customer.id`" — que era falso. Sem o campo, o dono não tinha como chegar aos próprios
pets. Vale a pena registrar o padrão do erro: uma decisão de recorte foi tomada com base numa
capacidade que se supunha existir e nunca foi conferida no código.

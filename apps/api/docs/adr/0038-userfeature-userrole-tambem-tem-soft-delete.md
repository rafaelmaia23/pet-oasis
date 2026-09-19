# Por que `UserFeature`/`UserRole` também têm soft delete

> Decisão migrada em 2026-09-18 do contexto temático da API (**Ciclo de vida** › *Soft delete*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Decidido **por auditoria de segurança** — "quem podia o quê, quando". Sem esse requisito seria
hard delete, porque autorização não costuma precisar de histórico. A escolha trocou a PK
composta por `id` próprio (para permitir múltiplos registros do mesmo par: N deletados + 1
ativo). A unicidade do ativo nasceu controlada por código e **migrou para o banco na 8.0**
(`@@unique([userId, roleId])` com reuso de linha — ver
[`0019`](0019-linha-userid-roleid-sempre.md)).

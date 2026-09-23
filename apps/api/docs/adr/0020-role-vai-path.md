# A role vai no path (D9)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Autorização** › *Escopo do override*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

A identidade do recurso é a tripla `(user, role, feature)` —
`PUT|DELETE /users/:userId/roles/:roleId/features/:featureId`. Body não identifica recurso:
quebraria a idempotência do `PUT`, e `DELETE` não tem semântica de body.

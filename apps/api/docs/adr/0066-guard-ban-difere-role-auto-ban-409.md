# O guard do ban difere do de role, e auto-ban é 409

> Decisão migrada em 2026-09-18 do contexto temático da API (**Identidade e sessões** › *Ban — a conta congelada*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

`assertAdminForBan` identifica o alvo privilegiado computando as features **efetivas do
usuário-alvo** (`getUserForFeatureComputation` + `computeEffectiveFeatures`, checando `*` /
`PERMISSION_FEATURES`) — diferente de `assertAdminForRoleAssignment`, que olha as features da
*role* sendo atribuída. Banir/desbanir a si mesmo é **409** (evita um admin se trancar para fora;
é o único caso alcançável, já que manager/attendant caem antes no guard de privilegiado, porque
manager tem `PERMISSION_FEATURES`). Ban seta as três colunas + invalida sessões numa transação;
unban limpa as três e preserva o `status`.

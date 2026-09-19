# Roles default na criação

> Decisão migrada em 2026-09-18 do contexto temático da API (**Autorização** › *Vínculo user↔role*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Employee nasce com `attendant`, customer com `customer` (`DEFAULT_EMPLOYEE_ROLES` /
`DEFAULT_CUSTOMER_ROLES` em `user.service.ts`). Sem `roleNames` vale o default; com
`roleNames`, `validateRoles` valida `appliesTo` (incompatível → 422 com `errors`).

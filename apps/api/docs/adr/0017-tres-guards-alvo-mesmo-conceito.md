# Nos três guards, o alvo é o mesmo conceito

> Decisão migrada em 2026-09-18 do contexto temático da API (**Autorização** › *Não-escalação*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

`assertAdminForBan`, `assertAdminForPermissionFeature` e `assertAdminForRoleAssignment`
convergiram em `assertActorIsAdmin` (7.x). O guard da reativação é a exceção deliberada — ver
[`0054`](0054-guard-corre-sobre-roles-vao-voltar.md).

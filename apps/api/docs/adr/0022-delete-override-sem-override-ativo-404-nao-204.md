# `DELETE` de override sem override ativo → 404, não 204

> Decisão migrada em 2026-09-18 do contexto temático da API (**Autorização** › *Escopo do override*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Decidido avisar em vez de devolver um sucesso vazio: o caller pediu para remover algo que não
existe, então é informado, não enganado. (`assertAdminForPermissionFeature` é reusado no `PUT`
e no `DELETE`.)

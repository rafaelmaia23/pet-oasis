# `create:`/`reactivate:customer-profile` moram em `SELF_MANAGEMENT_FEATURES`

> Decisão migrada em 2026-09-18 do contexto temático da API (**Autorização** › *Catálogo de features*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

A role `customer` morre exatamente quando o perfil de cliente é deletado. Se a feature de
reativar morasse nela, sumiria no instante em que passaria a ser necessária — o self-service
seria estruturalmente inalcançável. No baseline ela chega pela role de funcionário, que é
quem sobrou vivo.

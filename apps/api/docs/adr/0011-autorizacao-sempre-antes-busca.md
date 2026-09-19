# Autorização sempre antes da busca

> Decisão migrada em 2026-09-18 do contexto temático da API (**Autorização** › *Ordem e forma da checagem*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Se buscasse primeiro, alguém sem `:others` saberia se um id existe (404) ou não (sem erro) —
vaza existência. Checando `canActOnResource(user, feature, targetId)` antes, usando o id da
URL como `ownerId` e sem query, quem não tem `:others` recebe **403 igual** para id existente
ou inexistente.

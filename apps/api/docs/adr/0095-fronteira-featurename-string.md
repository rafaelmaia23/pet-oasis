# A fronteira `FeatureName` × `string`

> Decisão migrada em 2026-09-18 do contexto temático da API (**Contratos de API** › *Tipos*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Tipo estreito (union literal) descreve o que você **sabe** em compile-time — vale onde se digita o
literal. Dado do banco é `string` em runtime (o banco não conhece o union). Forçar o union além
dessa fronteira gera `as`, que é mentira ao compilador. A fronteira é onde o Zod valida.

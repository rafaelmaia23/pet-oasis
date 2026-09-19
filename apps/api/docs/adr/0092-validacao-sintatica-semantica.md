# Validação sintática × semântica

> Decisão migrada em 2026-09-18 do contexto temático da API (**Contratos de API** › *Erros*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Sintática (Zod, sem banco) no controller; semântica (precisa de banco — `appliesTo`, etc.) no
service. Ambas produzem 422 no mesmo shape.

# Whitelist e não blacklist

> Decisão migrada em 2026-09-18 do contexto temático da API (**Contratos de API** › *Views (presenter)*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Listar o que **pode** sair é à prova de futuro: um campo sensível novo no model não vaza por
omissão, porque não está na view. Blacklist exigiria lembrar de excluir cada campo novo.

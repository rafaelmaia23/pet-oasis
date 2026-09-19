# Perfis vêm antes de user↔role

> Decisão migrada em 2026-09-18 do contexto temático da API (**Autorização** › *Vínculo user↔role*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Atribuir role exige o perfil compatível já existir (a regra "sem perfil → crie primeiro, não
silencioso"). Se user↔role viesse antes, dependeria de algo inexistente.

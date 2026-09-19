# Furo fechado na 8.3 — nascer com a role é ser atribuído a ela

> Decisão migrada em 2026-09-18 do contexto temático da API (**Autorização** › *Não-escalação*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

`POST /users` aceitava `roleNames` e **nunca** rodava o guard: um manager criava um usuário já
com a role `admin`, desviando de `POST /users/:id/roles/:roleId`, que o exige.

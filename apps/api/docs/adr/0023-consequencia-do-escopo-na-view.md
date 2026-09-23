# Consequência na view

> Decisão migrada em 2026-09-18 do contexto temático da API (**Autorização** › *Escopo do override*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

`userViews.admin` deixou de ter `features` no topo e passou a espelhar a junção
(`roles[].features[]`); `GET /users/:id/features` expõe a role de cada override;
`GET /users/:id/permissions` continua `string[]` plano.

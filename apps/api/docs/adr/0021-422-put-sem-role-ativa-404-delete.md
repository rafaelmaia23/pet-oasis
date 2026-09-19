# 422 no `PUT` sem a role ativa, mas 404 no `DELETE`

> Decisão migrada em 2026-09-18 do contexto temático da API (**Autorização** › *Escopo do override*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Assimetria deliberada. No `PUT` a role é pré-condição da criação, então a validação semântica
nomeia o campo (`errors.roleId`) e orienta o caminho. No `DELETE` um único 404 cobre a tripla
inteira e **não revela** se o usuário tem aquela role.

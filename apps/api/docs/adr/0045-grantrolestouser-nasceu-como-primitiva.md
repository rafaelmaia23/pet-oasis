# `grantRolesToUser` nasceu como primitiva

> Decisão migrada em 2026-09-18 do contexto temático da API (**Ciclo de vida** › *Restauração*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Em `user.lifecycle.repository.ts`, porque três caminhos precisam do reuso de linha do D3 e um
`create` cru estoura o `@@unique([userId, roleId])` sempre que já houve aquele par:
`addUserRole`, a criação de perfil e a reativação nomeando uma role morta fora daquela cascata.

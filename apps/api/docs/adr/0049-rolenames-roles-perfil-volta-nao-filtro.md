# `roleNames` é "com que roles o perfil volta", não filtro

> Decisão migrada em 2026-09-18 do contexto temático da API (**Ciclo de vida** › *Perfil — os fluxos de produto*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Cada nome é **restaurado** (se morreu naquela cascata — `deletedAt` casa com o do perfil) ou
**concedido** (se morreu noutro instante ou nunca existiu). É a mesma semântica de criar, e é o
que faz a rota se comportar igual nos dois ramos. **Omitido, vale o default do D8:** voltam
todas as roles que morreram naquela cascata — o caminho comum ("devolve como estava") não obriga
ninguém a enumerar nada, e escolher um subconjunto continua possível. Uma semântica só no
projeto, no nível de perfil (K15) e no de conta (K21). Conceder role por aqui é conceder role,
então roda o mesmo `assertAdminForRoleAssignment` de `POST /users/:id/roles/:roleId`.

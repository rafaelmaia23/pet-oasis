# `DELETE` protege o último vínculo do perfil

> Decisão migrada em 2026-09-18 do contexto temático da API (**Autorização** › *Vínculo user↔role*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Se remover a role deixaria o perfil (customer/employee) sem nenhuma role ativa → **409**, com
`action` apontando para o `DELETE` do perfil, que é a via correta de encerrar o perfil inteiro.
Impede um user com perfil "órfão" sem role.

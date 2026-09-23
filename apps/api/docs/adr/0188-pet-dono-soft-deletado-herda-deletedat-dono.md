# O pet do dono soft-deletado herda o `deletedAt` do dono

> Decisão migrada em 2026-09-18 do contexto temático da API (**Domínio pet shop** › *Dataset fake do domínio (9.11)*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Não um `new Date()` próprio. É a correlação de timestamp que a restauração da Fase 8 usa para
decidir o que ressuscita junto com o perfil — um timestamp inventado no seed deixaria o pet órfão da
própria cascata. O invariante que o dataset respeita é o mesmo do runtime: nunca existe filho ativo
de pai morto.

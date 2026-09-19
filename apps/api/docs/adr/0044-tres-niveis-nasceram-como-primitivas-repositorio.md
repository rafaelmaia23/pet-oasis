# Os três níveis nasceram como primitivas de repositório (K7)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Ciclo de vida** › *Restauração*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Só o nível de role tinha rota HTTP quando a mecânica foi escrita (8.2). Em vez de adiar perfil e
conta para as sub-fases que os expõem — o que desenharia a mesma mecânica três vezes —, os três
nasceram juntos em `user.lifecycle.repository.ts`, com os dois sem rota cobertos por teste de
integração chamando o repositório direto (`tests/integration/modules/user/user.lifecycle.test.ts`,
precedente de `tests/integration/scripts/` e `tests/integration/lib/seed/`). As sub-fases
seguintes só ligaram rota e ator, sem uma linha nova de mecânica.

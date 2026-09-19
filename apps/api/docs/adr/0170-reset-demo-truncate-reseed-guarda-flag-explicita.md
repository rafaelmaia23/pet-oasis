# Reset do demo é truncate+reseed, e a guarda é flag explícita

> Decisão migrada em 2026-09-18 do contexto temático da API (**Infraestrutura** › *Seeds e ambiente demo*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

"Deletar o que não é seed" exigiria um marcador em toda tabela e cresceria a cada model novo da Fase
9; truncate+reseed é determinístico e não cresce. A guarda é `DEMO_MODE=true` — **não** `NODE_ENV`,
porque o deploy demo *é* production, e inferir apagaria o banco de produção de verdade caso o projeto
ganhe um. Sem a flag: erro barulhento, exit ≠ 0, nada apagado. O reset é **diário** (não a cada 3
dias) para ninguém encontrar a bagunça do visitante anterior, com o horário publicado na doc — o que
transforma um logout inesperado em comportamento documentado.

O reset é **higiene**, não o que garante o demo read-only — isso é RBAC (role `demo`). São duas
defesas independentes.

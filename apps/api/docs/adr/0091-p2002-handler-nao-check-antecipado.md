# P2002 no handler, não check antecipado

> Decisão migrada em 2026-09-18 do contexto temático da API (**Contratos de API** › *Erros*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

O check `findByEmail` antes de criar tem corrida: entre o SELECT e o INSERT, outro request insere. O
constraint `@unique` é a garantia real; traduzir o P2002 fecha a corrida e cobre todos os campos
únicos de uma vez.

# O ring buffer existe mesmo havendo Axiom

> Decisão migrada em 2026-09-18 do contexto temático da API (**Observabilidade** › *Destinos*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

É a única leitura de log disponível *de dentro da API*, sem conta de terceiro — o que torna a
observabilidade demonstrável para quem avalia o projeto. As limitações (é por processo, some no
restart) são declaradas no `meta` da própria resposta, em vez de escondidas.

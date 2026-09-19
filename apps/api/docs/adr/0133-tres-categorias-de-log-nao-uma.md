# Por que três e não uma

> Decisão migrada em 2026-09-18 do contexto temático da API (**Observabilidade** › *As três categorias*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Access log (tráfego), application log (o que aconteceu dentro do processo) e audit log (quem fez
o quê, em quem) têm emissor, volume, destino, mutabilidade e ciclo de vida diferentes.
Misturá-los faz cada um herdar o pior do outro: o log de negócio afogado em ruído de tráfego, e o
log de tráfego pagando o custo de escrita transacional no banco.

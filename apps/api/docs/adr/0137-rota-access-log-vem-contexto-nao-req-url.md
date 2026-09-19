# A rota do access log vem do contexto, não de `req.url`

> Decisão migrada em 2026-09-18 do contexto temático da API (**Observabilidade** › *As três categorias*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

O Express reescreve `req.url` ao descer nos routers montados, e o access log só sai no fim do
request — `/api/v1/status` chegava como `/`, e a regra de rota-de-ruído (o healthcheck do Compose,
que bate a cada 5s) nunca casava. Um caso em que o teste **do comportamento**, não do código, foi o
que pegou.

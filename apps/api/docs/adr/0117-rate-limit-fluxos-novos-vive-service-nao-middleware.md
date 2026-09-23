# Rate limit dos fluxos novos vive no service, não em middleware (8.7)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Segurança** › *Rate limit e lockout*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

`rateLimitByEmailTarget` lê `req.body.email` **antes** do controller, e nenhum dos dois pontos
novos cabe nisso: o signup só deve consumir no *ramo* de reativação (não em todo cadastro), e
`POST /users/:id/reactivate` não recebe email nenhum no request. Em vez de duplicar o limitador,
`enforce()` parou de depender de `res` — o 429 passou a carregar o `Retry-After` no próprio
`AppError` (campo `headers`), aplicado pelo error handler central, que já era o ponto único de
saída desde a 7.5. É isso que permite chamar `consumeEmailTargetLimit` de dentro de um service,
que por camada não enxerga `Request`/`Response`.

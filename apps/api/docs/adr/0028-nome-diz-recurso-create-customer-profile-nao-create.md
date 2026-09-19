# O nome diz o recurso (`create:customer-profile`, não `create:profile`)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Autorização** › *Catálogo de features*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

O attendant precisa atender um cliente no balcão sem ganhar poder nenhum sobre perfil de
funcionário. Com um `create:profile:others` genérico gateando as duas rotas, dar a feature ao
attendant seria escalação; com o recurso no nome, `canActOnResource` ainda casa self e
`:others` sozinho, e quem lê `GET /features` não precisa adivinhar o alcance de cada uma.

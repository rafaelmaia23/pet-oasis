# Refresh token hasheado em repouso — item que virou teste, não código

> Decisão migrada em 2026-09-18 do contexto temático da API (**Identidade e sessões** › *Sessão e refresh*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Levantado na Fase 7 e, na análise, **já estava implementado desde a Fase 3**:
`Session.refreshTokenHash` guarda `sha256(token)` (`src/lib/token.ts`), e o token opaco nunca é
persistido em plaintext. A comparação em tempo constante que o item pedia também não se aplica: o
lookup é `findUnique` pelo hash, não comparação byte a byte de segredo. Restou formalizar em
regressão (`auth.test.ts`): a coluna nunca é igual ao token cru do cookie — e é igual a
`hashToken(token cru)` —, e um token adulterado por um caractere devolve 401.

Trocar o sha256 por HMAC com `PEPPER` foi considerado e **recusado**: com token de 32 bytes de
entropia não há dicionário a montar, o ganho é marginal, e o custo seria uma migration invalidando
todas as sessões vivas — registrado no [backlog](../../../../docs/reference/backlog.md) caso o cenário mude.

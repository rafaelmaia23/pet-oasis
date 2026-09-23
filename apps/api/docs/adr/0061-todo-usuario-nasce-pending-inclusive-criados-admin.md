# Todo usuário nasce PENDING, inclusive os criados por admin

> Decisão migrada em 2026-09-18 do contexto temático da API (**Identidade e sessões** › *Status da conta*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

O objetivo da verificação é provar que o email é válido e pertence à pessoa. Isso vale igual para o
funcionário criado por um admin. Uma regra única ("todo mundo verifica") evita um `status`
condicional por origem de criação e não abre exceção que depois vira dívida. O custo — um passo de
verificação para usuários internos — é aceito.

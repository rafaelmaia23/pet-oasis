# O admin divide o balde com o `forgot-password` (K27)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Segurança** › *Rate limit e lockout*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

O orçamento é do **email**, não do ator. Um balde separado para a rota autenticada somaria na
caixa da mesma vítima e furaria a proteção que o limite por email-alvo existe para dar. O preço
— um admin legítimo pode levar 429 porque um terceiro gastou o orçamento daquele endereço — é
bloqueio temporário numa ação rara, e a `rule` no audit distingue a origem. No caminho do admin o
consumo vem **depois** de todos os guards: pedido recusado não gasta orçamento alheio.

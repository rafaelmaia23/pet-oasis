# As três rotas públicas de token ganharam limite juntas (K26)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Segurança** › *Rate limit e lockout*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Proteger só a rota nova de confirmação deixaria duas irmãs idênticas — públicas, consumindo token
opaco — desprotegidas sem razão de negócio que as distinga. Balde **próprio** (`tokenIpLimiter`),
não o de envio de email: enviar email e consumir token são superfícies diferentes, e compartilhar
faria um reset legítimo comer o orçamento do outro.

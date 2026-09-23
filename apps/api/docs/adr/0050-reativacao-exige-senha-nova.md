# A reativação exige senha nova (K17)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Ciclo de vida** › *Conta — deleção e reativação*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

O usuário nunca volta com a credencial de antes da deleção — que pode ter sido justamente o motivo
dela. A rota de confirmação é pública e o **token é a credencial** (molde do `reset-password`),
então consumir o token também prova posse do email: por isso a confirmação já seta
`status = ACTIVE` e zera `mustChangePassword`, em vez de exigir um `verify-email` depois.

# O admin não reativa nada sozinho

> Decisão migrada em 2026-09-18 do contexto temático da API (**Ciclo de vida** › *Conta — deleção e reativação*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

`POST /users/:id/reactivate` só emite o token e envia o email — quem conclui é o dono, na mesma
confirmação pública do self-service. Os dois caminhos convergem num ponto só, e a volta de uma
usuário sempre passa por alguém que prova posse do email.

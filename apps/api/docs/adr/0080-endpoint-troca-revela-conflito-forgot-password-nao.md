# O endpoint de troca revela conflito (409), o `forgot-password` não

> Decisão migrada em 2026-09-18 do contexto temático da API (**Identidade e sessões** › *Troca de email*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

`forgot-password` é anônimo — qualquer um poderia testar emails para descobrir quais existem, então
a resposta é sempre genérica. `change-email` exige a senha atual do próprio usuário; para abusar do
409 e enumerar, seria preciso já ter comprometido esse usuário, ponto em que enumerar emails de
terceiros é o menor dos danos. Mesma lógica que já vale para o signup.

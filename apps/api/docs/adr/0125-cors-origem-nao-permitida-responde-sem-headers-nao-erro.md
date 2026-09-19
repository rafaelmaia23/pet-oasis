# CORS de origem não-permitida responde sem os headers, não com erro

> Decisão migrada em 2026-09-18 do contexto temático da API (**Segurança** › *Hardening HTTP*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Quem bloqueia uma origem estranha é o **navegador**, que só precisa da ausência de
`Access-Control-Allow-Origin`; lançar ali viraria 500 numa requisição que a API atendeu
corretamente. Request sem `Origin` (curl, Bruno, a própria suíte) passa — CORS não é autenticação
e não deve virar uma.

# O admin dispara o email de reset na hora

> Decisão migrada em 2026-09-18 do contexto temático da API (**Identidade e sessões** › *Senha*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Reaproveita o `buildPasswordResetEmail` existente e some com a ambiguidade de "por que fui deslogado
e não consigo mais entrar" — o usuário recebe o porquê e o link no mesmo momento em que a sessão cai.

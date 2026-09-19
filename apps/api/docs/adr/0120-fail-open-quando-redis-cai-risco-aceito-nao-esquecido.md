# Fail-open quando o Redis cai é risco aceito, não esquecido

> Decisão migrada em 2026-09-18 do contexto temático da API (**Segurança** › *Fail-open e o que a execução ensinou*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Redis indisponível → rate limit e lockout são ignorados, o request segue, e a falha emite `error`
no application log (e no Sentry). Fail-closed (503 nas rotas de auth) eliminaria a janela sem
proteção, mas transformaria o Redis em ponto único de falha do **login inteiro** — um restart do
container derrubaria a autenticação. Disponibilidade do fluxo principal vence; a mitigação é a
falha ser barulhenta, não silenciosa.

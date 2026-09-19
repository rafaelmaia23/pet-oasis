# Os dois bugs que motivaram a reformulação (Fase 6)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Infraestrutura** › *Ambientes*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

1. O app **nunca falava com a Resend** — o compose único hardcodava `SMTP_HOST: mailpit` /
   `SMTP_PORT: 1025` no serviço `app` e não repassava `SMTP_USER`/`SMTP_PASS`.
2. Um bring-up de "produção" subia `db_test` e `mailpit` (sem profile, sempre ligados).

# `read:audit-log:full` entrou em `PRIVILEGED_FEATURES`

> Decisão migrada em 2026-09-18 do contexto temático da API (**Autorização** › *Catálogo de features*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Ela destrava o IP inteiro no audit log; o racional está em
[observability.md](0139-read-audit-log-full-nao-role-como-ancora.md).
`read:log`/`read:audit-log` continuam normais, concedíveis sem ser admin.

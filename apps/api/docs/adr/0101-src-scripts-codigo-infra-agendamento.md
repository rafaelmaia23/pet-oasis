# `src/scripts/` é código; `infra/` é agendamento

> Decisão migrada em 2026-09-18 do contexto temático da API (**Arquitetura** › *Onde cada coisa vive*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

`src/scripts/` importa Prisma/`env`/`logger` e é bundlado pelo tsup. `infra/` guarda o agendamento
(systemd timer, preferido a cron por dar `journalctl`, `Persistent=` e proteção contra sobreposição).

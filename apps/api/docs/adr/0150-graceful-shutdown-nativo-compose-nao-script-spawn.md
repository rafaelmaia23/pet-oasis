# Graceful shutdown nativo do Compose, não script com `spawn`

> Decisão migrada em 2026-09-18 do contexto temático da API (**Infraestrutura** › *Ambientes*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Healthchecks + `depends_on: service_healthy` + `--wait` (prod/test); dev em **foreground**
(incompatível com `--wait`), Ctrl+C → SIGTERM gracioso. O app trata SIGTERM/SIGINT via
`createShutdownHandler` (`src/lib/shutdown.ts`, injeção de dependência → testável):
`server.close()` (drena in-flight) → `prisma.$disconnect()` → exit, com timeout de força-saída (10s
< `stop_grace_period` de 15s do prod). O entrypoint faz `exec` do Node/tsx para ele ser **PID 1** e
receber o sinal.

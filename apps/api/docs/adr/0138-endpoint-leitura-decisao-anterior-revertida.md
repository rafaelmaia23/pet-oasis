# Endpoint de leitura — decisão anterior revertida

> Decisão migrada em 2026-09-18 do contexto temático da API (**Observabilidade** › *Audit log*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

O plano original adiava `GET /audit-logs` para uma fase futura, deixando a trilha consultável só
via banco. Revertido: uma trilha que só o mantenedor consegue ler não demonstra nada num projeto de
portfólio, e a regra de PII da política (`metadata` só com ids e enums) foi tomada justamente para
tornar a leitura segura. O endpoint entra com paginação **cursor** e filtros, e é **só `GET`** — a
ausência de `PATCH`/`DELETE` é imutabilidade intencional, coberta por teste.

# Uma linha por `(userId, roleId)` para sempre (D3)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Autorização** › *Escopo do override*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

A unicidade saiu do código e foi para o banco. Isso exige **reuso de linha** na re-concessão
(`deletedAt = null`) em vez de linha nova, o que dá à `UserRole` uma **identidade estável** —
sem ela o FK do override ficaria órfão a cada ciclo de revogar/reconceder. O histórico de
ciclos não cabe mais na tabela e vive no audit log (D7): **tabela guarda estado, audit log
guarda história.**

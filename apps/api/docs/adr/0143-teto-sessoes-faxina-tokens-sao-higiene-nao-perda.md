# Teto de sessões e faxina de tokens são higiene, não perda de auditoria

> Decisão migrada em 2026-09-18 do contexto temático da API (**Observabilidade** › *Higiene e resiliência*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

O teto (`MAX_LIVE_SESSIONS`, default 5) evita acumular sessões vivas indefinidamente — ao exceder,
a **mais antiga é invalidada** e o login segue; recusar o login puniria o usuário por uma regra de
higiene interna. A faxina faz **hard delete** (não soft) de `Session`/`VerificationToken` mortos há
tempo suficiente: são registros técnicos, não dados de negócio, e o rastro de auditoria de verdade
vive no `AuditLog`.

**Critério de "morto" (firmado com o usuário):** conta a partir de **qualquer** timestamp de morte
— `expiresAt` vencido **ou** `usedAt` **ou** `invalidatedAt`, checados de forma independente —, não
só do `expiresAt` natural: uma sessão revogada há meses já é lixo mesmo com `expiresAt` no futuro.

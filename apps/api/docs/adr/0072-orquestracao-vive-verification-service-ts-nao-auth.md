# A orquestração vive em `verification.service.ts`, não em `auth.service`

> Decisão migrada em 2026-09-18 do contexto temático da API (**Identidade e sessões** › *Verificação de email*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

`auth.service` já importa `user.service` (para o signup), e `user.service` precisa disparar a
emissão na criação — pôr a emissão em `auth.service` fecharia o ciclo
`user.service → auth.service → user.service`. `verification.service.ts` concentra
`issueEmailVerification`/`verifyEmail`/`resendVerification` importando só `auth.repository`,
`user.repository`, `lib/email` e `lib/token`. O gate de login continua em `auth.service.login` (só
lê `user.status`/`user.bannedAt`, que já vêm no `findUserByEmail`). Análogo: senha vive em
`password.service.ts`, mesma razão de coesão e anti-ciclo.

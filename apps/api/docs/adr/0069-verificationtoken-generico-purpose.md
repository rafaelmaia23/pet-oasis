# Um `VerificationToken` genérico, com `purpose`

> Decisão migrada em 2026-09-18 do contexto temático da API (**Identidade e sessões** › *Verificação de email*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Email-verification e password-reset compartilham exatamente a mesma forma (token opaco, hash
SHA-256 salvo, `expiresAt`, `usedAt`, `userId`) — só mudam finalidade e TTL. Um model com `purpose`
evita dois repositórios quase idênticos. Reusa `hashToken` de `src/lib/token.ts` (mesmo padrão do
refresh: guarda só o hash, entrega o cru ao usuário). `change-password` não usa esse model: não há
token, a prova é a senha atual. O enum cresceu depois com `EMAIL_CHANGE` (7.15) e
`ACCOUNT_REACTIVATION` (8.4).

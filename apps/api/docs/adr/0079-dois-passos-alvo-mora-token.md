# Dois passos, e o alvo mora no token

> Decisão migrada em 2026-09-18 do contexto temático da API (**Identidade e sessões** › *Troca de email*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

`pendingEmail` existe para exibição (`GET /me`) e para o `PATCH /users/:id` continuar recusando
email (que passa a ter endpoint dedicado). A verdade sobre **qual** email um token confirma vive na
própria linha do `VerificationToken` (`newEmail`): se dependesse de reler `pendingEmail` no confirm,
um usuário que pedisse a troca duas vezes seguidas (A depois B) poderia ter o link antigo (de A)
confirmando B, porque a coluna já teria sido sobrescrita.

Uma nova chamada de `change-email` invalida o token anterior e sobrescreve `pendingEmail` — mesmo
idioma de "unicidade do ativo por código" — e isso dobra como **mecanismo de cancelamento**: o dono
real, se ainda souber a própria senha, sobrescreve uma troca maliciosa pedindo a troca de volta para
o próprio email.

# A checagem de `mustChangePassword` entra depois do `bannedAt` e antes do `status`

> Decisão migrada em 2026-09-18 do contexto temático da API (**Identidade e sessões** › *Senha*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Banimento é a decisão mais severa e terminal (um humano cortou o acesso de propósito);
`mustChangePassword` é recuperável via email. Se as duas coexistirem (conta banida **e** com reset
forçado pendente, ex. durante investigação), a mensagem de banido é a que aparece, porque é a
informação dominante para quem tenta entrar.

# Change-password é single-step, sem código por email

> Decisão migrada em 2026-09-18 do contexto temático da API (**Identidade e sessões** › *Senha*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

O usuário já está logado; exigir a senha atual já protege contra sessão sequestrada (um invasor com
o access token não sabe a senha). Um segundo fator por email para usuário logado seria mais atrito
que segurança — descartado. Contraste: o reset, para usuário **não** logado, precisa do token por
email porque não há outra prova de identidade. Sucesso dos dois → **204**; token de reset ruim →
**400**; `newPassword` fraca → **422** (reusa `passwordSchema`).

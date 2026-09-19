# A âncora é a role admin, não a feature

> Decisão migrada em 2026-09-18 do contexto temático da API (**Autorização** › *Não-escalação*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Se o guard checasse a feature `manage:permission`, ela mesma poderia ser concedida por
override → escalação. A role `admin` é "dura" (vem de atribuição de role), por isso é a
âncora. Um attendant com `manage:permission` emprestada não é admin → não mexe em
`PRIVILEGED_FEATURES`.

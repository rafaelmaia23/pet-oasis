# Anti-enumeração em forgot / resend / signup

> Decisão migrada em 2026-09-18 do contexto temático da API (**Identidade e sessões** › *Status da conta*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

`forgot-password` e `verify-email/resend` respondem **sempre 200 genérico**, independentemente de o
email existir, estar ACTIVE ou banido — senão a resposta viraria oráculo de "quais emails têm
conta". O email real só sai quando a condição interna é satisfeita. No mesmo espírito, signup com
email de um banido mantém o **409 genérico** já produzido pelo `@unique` (a linha do banido
persiste, não é deletada), sem mensagem especial.

# `costCents` em **todas** as variantes

> Decisão migrada em 2026-09-18 do contexto temático da API (**Domínio pet shop** › *Dataset fake do domínio (9.11)*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Uma variante com `costCents: null` produz o mesmo JSON para quem tem `read:product:cost` e para quem
não tem — é exatamente o caso que não prova nada, e a conta `demo` existe para exibir o
mascaramento (mesmo desenho de `read:audit-log:full`). O custo é **derivado** do preço, não
sorteado: sortear os dois independentemente produziria custo acima do preço em parte do roster, e a
view de custo ficaria demonstrando margem negativa por acidente.

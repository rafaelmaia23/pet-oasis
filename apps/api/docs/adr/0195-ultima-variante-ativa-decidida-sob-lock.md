# A última variante ativa é decidida sob lock

> Decisão migrada em 2026-09-18 do contexto temático da API (**Domínio pet shop** › *O que o fecho da fase (9.12) corrigiu no catálogo*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Contar irmãs vivas e excluir eram duas idas ao banco: dois `DELETE` simultâneos no mesmo
produto contavam `1` cada um antes de qualquer commit e passavam os dois, deixando produto
ativo com zero variantes — exatamente o que a X6 proíbe. O remédio é o mesmo da 9.10 nas
imagens, `SELECT ... FOR UPDATE` na linha do produto, e é o **terceiro e último** ponto de
SQL cru do projeto. A promoção da default desceu junto para dentro da transação: eleger a
substituta fora dela seria ler o estado que o lock existe para congelar.

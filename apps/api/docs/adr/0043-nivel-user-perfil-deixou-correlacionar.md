# O nível `User` → perfil deixou de correlacionar (K20)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Ciclo de vida** › *Restauração*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

O D5 original mandava restaurar o perfil cujo `deletedAt` batesse com o da conta, e isso
produzia um beco sem saída: ex-cliente perde o perfil em T1, tem a conta deletada em T2, e ao
reativar não restaura (T1 ≠ T2) nem cria do zero (a linha existe) — terminando com conta ativa
e **zero** perfil ativo, contra o D14. A correlação existia para impedir carona; só que nesse
nível ninguém pega carona, porque **perfil nenhum volta sem ser nomeado** (o self-service nomeia
`CUSTOMER` e só; o admin nomeia a escolha dele). O corte mudou de lugar: *perfil volta porque
foi pedido; role volta porque correlaciona.*

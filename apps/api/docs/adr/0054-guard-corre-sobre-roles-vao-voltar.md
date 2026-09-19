# O guard corre sobre as roles que vão voltar (K22)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Ciclo de vida** › *Conta — deleção e reativação*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

O molde `assertAdminForPrivilegedTarget` do ban/lock não serve aqui: ele lê as features
**efetivas** do alvo, e num alvo deletado todas as roles estão soft-deletadas — o conjunto sairia
vazio e o guard passaria sempre. O guard resolve o conjunto que de fato vai voltar (as nomeadas,
ou as que morreram na cascata) e roda `assertAdminForRoleAssignment` em cada uma, **antes de
qualquer escrita** — cobrindo os dois vetores (a conta *era* privilegiada / o ator *nomeou* uma
role privilegiada) sem conceito novo.

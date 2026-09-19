# A gravação transacional do audit vive no repository; o service passa o descritor

> Decisão migrada em 2026-09-18 do contexto temático da API (**Arquitetura** › *Onde cada coisa vive*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

A política exige que a linha de audit de uma ação que muda estado entre na **mesma** `$transaction`
da mutação; a regra de camadas diz que só o repo toca o Prisma, e é lá que a transação vive.
Conciliar os dois: o service decide a semântica (action/targetType/targetId/metadata — decisão de
negócio) e passa um `AuditDescriptor` ao método de escrita do repo, que roda mutação +
`record(descriptor, tx)` numa transação interativa. A alternativa (service abrir
`prisma.$transaction` e passar `tx` ao repo) daria call sites mais idiomáticos, mas furaria "só o
repo toca o Prisma" — preterida.

# `record` é lib de observabilidade, não repository

> Decisão migrada em 2026-09-18 do contexto temático da API (**Arquitetura** › *Onde cada coisa vive*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Ela pode escrever no Prisma de qualquer camada (o login falho grava direto do service), pelo mesmo
enquadramento do `logger`/`AsyncLocalStorage`: observabilidade, não dado de negócio. Com `tx`
propaga o erro (rollback); sem `tx` engole e loga.

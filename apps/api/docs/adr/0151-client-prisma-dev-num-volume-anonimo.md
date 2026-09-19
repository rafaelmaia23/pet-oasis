# O client Prisma do dev num volume anônimo

> Decisão migrada em 2026-09-18 do contexto temático da API (**Infraestrutura** › *Ambientes*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

O generator escreve em `src/generated`, que o bind-mount de `./src` mascararia; um volume anônimo em
`/app/src/generated` preserva o client gerado no container (o entrypoint de dev roda `prisma
generate` no start). Evita churn nos imports `@/generated`. O stage `dev` do Dockerfile para no `pnpm
install` completo (sem bundle/prune) e fica root, evitando EACCES de uid no bind-mount; o `runtime` de
prod segue intocado.

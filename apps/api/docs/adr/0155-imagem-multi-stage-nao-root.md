# Imagem multi-stage e não-root

> Decisão migrada em 2026-09-18 do contexto temático da API (**Infraestrutura** › *Imagem e boot de produção*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

O build (deps completas, `prisma generate`, `tsup`) é pesado e não precisa ir para produção: um
stage `deps` isola as dependências de produção, o stage `build` gera o `dist/`, e o `runtime` copia
só `node_modules` de prod + `dist/` + schema/migrations (para o `migrate deploy`). Roda como `USER
node` — higiene básica de container.

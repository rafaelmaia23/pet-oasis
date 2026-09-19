# `sharp` no ARM64 exige build no próprio servidor (9.10)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Infraestrutura** › *Imagem e boot de produção*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

O `Dockerfile` é `node:24-bookworm-slim` (glibc, não Alpine), então o `pnpm install` baixa o prebuild
`@img/sharp-linux-arm64` — nada compila, nenhum pacote de sistema entra na imagem.

A condição é que a imagem seja **construída no ARM**, que é o que o `prod:up` faz (o Compose tem
`build:`, e o build roda no host). Construir num x86 e enviar a imagem pronta quebra em runtime
com `could not load the sharp module` — erro que não se parece nada com a causa, e que só
apareceria no primeiro upload depois do deploy.

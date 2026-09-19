# O seed é bundlado pelo tsup (`dist/seed.js`)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Infraestrutura** › *Imagem e boot de produção*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

`prisma db seed` invoca `tsx prisma/seed.ts`, que importa de `src/` — nada disso existe na imagem de
produção (só `dist/` + node_modules de prod, sem `tsx` nem código-fonte). Adicionar `prisma/seed.ts`
como 2ª entry do tsup produz um `dist/seed.js` auto-contido (o client Prisma gerado é embutido no
bundle; o wasm do query-compiler vem de `@prisma/client` em runtime), que o entrypoint roda com
`node dist/seed.js`. O fluxo de dev segue usando `prisma db seed` (tsx) inalterado.

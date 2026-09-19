# Envs por arquivo + dotenv-cli

> Decisão migrada em 2026-09-18 do contexto temático da API (**Infraestrutura** › *Ambientes*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

`.env.development`/`.env.test`/`.env.production` (fora do git) + `.env.example` versionado — colapsa
cinco fontes numa por ambiente. Containers recebem via `env_file:`. No host, o `vitest.config.ts`
carrega `.env.test` (`override: true`), então `pnpm exec vitest run <arquivo>` funciona sozinho, e a
autoria de migration usa `dotenv-cli` (`dotenv -e .env.development -- prisma …`). A URL do banco de
teste, antes duplicada em quatro lugares, vive só no `.env.test`. `src/config/env.ts` e
`prisma.config.ts` ficam intocados (o `import "dotenv/config"` vira no-op sem `.env` na raiz).

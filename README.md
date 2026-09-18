# Pet Oasis

Monorepo do Pet Oasis — um pet shop online. Gerido por **pnpm workspaces**
(`pnpm-workspace.yaml` na raiz, um só `pnpm-lock.yaml`).

| Caminho | O quê |
|---|---|
| [`apps/api`](apps/api/README.md) | A API REST (Node/Express, Prisma, Zod) — README, guias, ADRs e tracker vivem lá |
| `packages/tsconfig` | Presets de TypeScript (`@pet-oasis/tsconfig`): base estrito + um por alvo (Node, Next, biblioteca) |
| `packages/biome-config` | Base do Biome (`@pet-oasis/biome-config`): formatter, linter e estilo; cada app estende e acrescenta só os ignores que são seus |

```bash
corepack enable                      # uma vez por máquina; instala o pnpm pinado em `packageManager`
pnpm install                         # o workspace inteiro, da raiz
pnpm --filter api test               # qualquer script da API, da raiz…
cd apps/api && pnpm run dev          # …ou de dentro do app
```

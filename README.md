# Pet Oasis

Monorepo do Pet Oasis — um pet shop online. Gerido por **pnpm workspaces**
(`pnpm-workspace.yaml` na raiz, um só `pnpm-lock.yaml`) e orquestrado por **Turborepo**
(`turbo.jsonc` na raiz).

| Caminho | O quê |
|---|---|
| [`apps/api`](apps/api/README.md) | A API REST (Node/Express, Prisma, Zod) — README, guias e ADRs (índice em [`apps/api/docs/adr/README.md`](apps/api/docs/adr/README.md)) vivem lá |
| `packages/tsconfig` | Presets de TypeScript (`@pet-oasis/tsconfig`): base estrito + um por alvo (Node, Next, biblioteca) |
| `packages/biome-config` | Base do Biome (`@pet-oasis/biome-config`): formatter, linter e estilo; cada app estende e acrescenta só os ignores que são seus |
| [`docs/`](docs/README.md) | Documentação do **sistema**: ADRs de sistema, [índice das fases](docs/todo.md), [backlog](docs/reference/backlog.md), guias e config das skills |
| [`.scratch/`](.scratch/README.md) | O tracker (spec + issues por esforço), único para o monorepo |
| [`CONTEXT-MAP.md`](CONTEXT-MAP.md) | O mapa dos contextos — um por app, com o glossário (`CONTEXT.md`) de cada um |
| `tools/` | Scripts da raiz que não pertencem a pacote nenhum (o `docs:check`) |

```bash
corepack enable                      # uma vez por máquina; instala o pnpm pinado em `packageManager`
pnpm install                         # o workspace inteiro, da raiz
```

## Comandos da raiz

Cada script da raiz (menos `docs:check`) é `turbo run <task>`: o Turbo roda o script de mesmo
nome em todo pacote que o tiver, na ordem que o `turbo.jsonc` declara, e em paralelo onde a
ordem permite. `typecheck` e `lint` também rodam as tasks de raiz (`//#typecheck:root`,
`//#lint:root`) que cobrem `tools/`.

| Comando | O que faz | Cache |
|---|---|---|
| `pnpm typecheck` | `tsc --noEmit` de cada pacote | sim |
| `pnpm lint` | `biome check .` de cada pacote — os pacotes de config antes de quem os estende | sim |
| `pnpm build` | build de cada pacote que tem um (hoje só a API, `tsup` → `dist/`) | sim, com `dist/` restaurado do cache |
| `pnpm test` | a suíte de cada pacote (a da API sobe Postgres e Redis via Compose e derruba ao final) | **não** |
| `pnpm dev` | sobe todos os apps em dev (persistente; Ctrl+C derruba) | **não** |
| `pnpm docs:check` | links e âncoras da documentação do monorepo inteiro (`tools/check-docs-links.ts`; script da raiz, não task do Turbo) | — |

Um app só: `pnpm dev --filter=@pet-oasis/api` — o pnpm repassa a flag ao Turbo, e o mesmo
`--filter` vale para qualquer task. O nome é o **completo, com escopo** (ou o caminho,
`--filter=./apps/api`): o Turbo não aceita `api` sozinho, diferente do `pnpm --filter api`.

Os scripts que são de um app (na API: `db:*`, `dev:*`, `prod:*`, `test:services:*`) continuam
no `package.json` dele e rodam com `pnpm --filter api <script>` da raiz ou `pnpm run <script>`
de dentro do app.

### O que é cacheado, e por quê

Rodar `pnpm typecheck` (ou `lint`, `build`) duas vezes sem mudar nada devolve
`FULL TURBO` na segunda: o Turbo guarda o resultado (logs e, no `build`, o `dist/`) sob um hash
da task e o devolve quando o hash bate. O cache vive em `.turbo/`, fora do git. `test` não
cacheia de propósito (a suíte depende de Compose e `.env.test`, que o Turbo não vê) e `dev` é
um servidor, não um resultado. O que entra no hash, por que cada task tem o `dependsOn` que tem
e o porquê de `test` ficar fora estão em
[`apps/api/docs/adr/0104`](apps/api/docs/adr/0104-turborepo-pipeline-workspace-test-fica-fora-cache.md);
cachear `test` está no backlog da API.

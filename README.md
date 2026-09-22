# Pet Oasis

[![CI](https://github.com/rafaelmaia23/pet-oasis/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/rafaelmaia23/pet-oasis/actions/workflows/ci.yml)

Monorepo do Pet Oasis — um pet shop online. Gerido por **pnpm workspaces**
(`pnpm-workspace.yaml` na raiz, um só `pnpm-lock.yaml`) e orquestrado por **Turborepo**
(`turbo.jsonc` na raiz).

| Caminho | O quê |
|---|---|
| [`apps/api`](apps/api/README.md) | A API REST (Node/Express, Prisma, Zod) — README, guias e ADRs (índice em [`apps/api/docs/adr/README.md`](apps/api/docs/adr/README.md)) vivem lá |
| [`apps/web`](apps/web/README.md) | O front web (Next 16, React 19, Tailwind 4), importado com histórico do `pet-oasis-web` na Fase 11 — README, design system e ADRs (índice em [`apps/web/docs/adr/README.md`](apps/web/docs/adr/README.md)) vivem lá |
| `packages/tsconfig` | Presets de TypeScript (`@pet-oasis/tsconfig`): base estrito + um por alvo (Node, Next, biblioteca) |
| `packages/biome-config` | Base do Biome (`@pet-oasis/biome-config`): formatter, linter e estilo; cada app estende e acrescenta só os ignores que são seus |
| [`packages/api-contracts`](packages/api-contracts/README.md) | O que atravessa a rede entre a API e os clientes (`@pet-oasis/api-contracts`): schemas Zod de request, views de resposta, enums de domínio, nomes de role/feature e shape de erro; só depende de `zod`, consumido do fonte TS |
| [`docs/`](docs/README.md) | Documentação do **sistema**: ADRs de sistema, [índice das fases](docs/todo.md), [backlog](docs/reference/backlog.md), guias e config das skills |
| [`.scratch/`](.scratch/README.md) | O tracker, único para o monorepo: uma pasta por fase (`fase-<n>-<slug>/`), com a spec e uma issue por arquivo |
| [`CONTEXT-MAP.md`](CONTEXT-MAP.md) | O mapa dos contextos — um por app, com o glossário (`CONTEXT.md`) de cada um |
| `infra/` | O stack Compose do **sistema** (base + overrides `dev`/`test`/`prod`): API, web, Postgres, Redis e mailpit num projeto só por ambiente |
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
| `pnpm build` | build de cada pacote que tem um (a API, `tsup` → `dist/`; o web, `next build` → `.next/`) | sim, com a saída restaurada do cache |
| `pnpm test` | a suíte de cada pacote (a da API sobe Postgres e Redis via Compose e derruba ao final; a do contrato é pura) | **não** |
| `pnpm dev` | sobe todos os apps em dev (persistente; Ctrl+C derruba): o stack Compose da API e o `next dev` do web no host | **não** |
| `pnpm docs:check` | links e âncoras da documentação do monorepo inteiro (`tools/check-docs-links.ts`; script da raiz, não task do Turbo) | — |
| `pnpm prod:up [serviço…]` | o stack de produção (`infra/`): sem argumento sobe tudo; `pnpm prod:up api` (ou `web`) reconstrói e reinicia só aquele serviço, o outro continua rodando | — |
| `pnpm prod:down` · `pnpm prod:logs` | derruba o stack de produção · acompanha os logs | — |

Um app só: `pnpm dev --filter=@pet-oasis/api` — o pnpm repassa a flag ao Turbo, e o mesmo
`--filter` vale para qualquer task. O nome é o **completo, com escopo** (ou o caminho,
`--filter=./apps/api`): o Turbo não aceita `api` sozinho, diferente do `pnpm --filter api`.

Os scripts que são de um app (na API: `db:*`, `dev:*`, `test:services:*`; no web: `contrast`)
continuam no `package.json` dele e rodam com `pnpm --filter api <script>` da raiz ou
`pnpm run <script>` de dentro do app. Os `prod:*` são da raiz porque o stack de produção é do
sistema — os arquivos Compose vivem em `infra/`, e em dev e teste quem os invoca é a API
(`pnpm --filter api dev`, `test`), porque nesses ambientes o stack é o dela: o web roda no
host.

### O que é cacheado, e por quê

Rodar `pnpm typecheck` (ou `lint`, `build`) duas vezes sem mudar nada devolve
`FULL TURBO` na segunda: o Turbo guarda o resultado (logs e, no `build`, o `dist/`) sob um hash
da task e o devolve quando o hash bate. O cache vive em `.turbo/`, fora do git. `test` não
cacheia de propósito (a suíte depende de Compose e `.env.test`, que o Turbo não vê) e `dev` é
um servidor, não um resultado. O que entra no hash, por que cada task tem o `dependsOn` que tem
e o porquê de `test` ficar fora estão em
[`apps/api/docs/adr/0104`](apps/api/docs/adr/0104-turborepo-pipeline-workspace-test-fica-fora-cache.md);
cachear `test` está no backlog da API.

## Commits

Conventional Commits em inglês, `tipo(escopo): descrição`, com o **escopo obrigatório** e
restrito ao enum do workspace — `api`, `web`, `contracts`, `tsconfig`, `biome-config`, `infra`,
`ci`, `repo` (multi-escopo com vírgula). O `pnpm install` da raiz instala o hook `commit-msg`
(husky), que roda o commitlint (`commitlint.config.mjs`) e recusa a mensagem fora da régua antes
de o commit existir. Merge usa a mensagem padrão do Git, que o commitlint ignora. A regra
completa, com o que o preset recusa (descrição em maiúscula, ponto final, header acima de 100
colunas), está no [`CLAUDE.md`](CLAUDE.md) da raiz.

## CI

Todo PR e todo push em `dev`/`main` rodam o workflow [`ci.yml`](.github/workflows/ci.yml) no
GitHub Actions. O job `verify` roda `typecheck`, `lint` e `test` via Turborepo **só dos pacotes
afetados** em relação à base (a branch-alvo do PR, ou o commit anterior no push) — um PR que
muda só a raiz não roda nada disso; um que toca `apps/api` roda a API inteira, docs inclusive,
porque o afetado é por pacote — e o `docs:check` do repo inteiro, sempre. Postgres e Redis sobem como `services` do job, nas
portas do `.env.test` (que o workflow gera do `.env.example`; nunca é commitado), e o `test` da
API, vendo `CI=true`, chama o Vitest direto em vez de subir o Compose. O job `commitlint` valida
cada commit do PR contra a convenção acima. Sem deploy automático e sem remote cache do Turbo.
Merge de fase na `dev` e de `dev` na `main` só com o CI do PR verde — a regra está no
[`CLAUDE.md`](CLAUDE.md) da raiz.

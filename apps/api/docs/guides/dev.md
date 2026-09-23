# Rodar em desenvolvimento (Docker)

Pré-requisitos: **Docker** (com Compose) e **Node 24** com o corepack ligado — os scripts do
`package.json` rodam via `pnpm`, e é o corepack que instala a versão exata pinada no campo
`packageManager` do `package.json` da **raiz do monorepo** (nada de `npm i -g pnpm`). Tudo mais
roda em container, inclusive o app — com hot-reload via `tsx watch` lendo `src/` por bind-mount.

A API é o projeto `api` do workspace pnpm e vive em `apps/api`. Os arquivos de ambiente
(`.env.*`) e todo script abaixo são **dela**: rode-os de dentro de `apps/api`, ou da raiz com
`pnpm --filter api <script>` (o mesmo script, o mesmo cwd).

```bash
corepack enable                     # uma vez por máquina; o pnpm certo vem na primeira chamada
git clone <repo> && cd pet-oasis/apps/api
cp .env.example .env.development   # preencha JWT_SECRET e PEPPER (≥ 32 chars cada)
pnpm run dev                        # Compose em foreground: db + mailpit + app
```

Para rodar a suíte, o `typecheck` ou o `lint` no host é preciso instalar o workspace uma vez,
**da raiz** (`pnpm install` em `pet-oasis/`): é lá que vivem o `pnpm-lock.yaml` e o
`pnpm-workspace.yaml`, e é a raiz que o pnpm instala — rodar `pnpm install` de dentro de
`apps/api` faz o mesmo, porque o pnpm sobe até o workspace.

`git blame` de um arquivo da API atravessa o commit que a moveu para `apps/api` se o clone
souber ignorá-lo — uma vez por clone:

```bash
git config blame.ignoreRevsFile .git-blame-ignore-revs   # na raiz do monorepo
```

Na subida o container aplica as migrations (`prisma migrate deploy`) e semeia features/roles (usuário demo só com `SEED_DEMO_USER=true`). Então acesse:

- API: `http://localhost:3000/api/v1`
- Referência interativa: `http://localhost:3000/reference`
- Mailpit (emails de dev): `http://localhost:8025` (SMTP `1025`)

`Ctrl+C` derruba tudo com shutdown gracioso.
`pnpm run dev:down`, `pnpm run dev:reset` (recria do zero, apagando o volume)
`pnpm run dev:mail` sobe só o Mailpit.
`pnpm run dev:db` sobe só o Postgres-de-dev (detached, espera ficar healthy) — é o que
`db:migrate`/`db:seed`/`db:studio` precisam de pé quando você não quer a stack inteira
em foreground.

Comandos úteis:

| Comando | O quê |
|---|---|
| `pnpm test` | Sobe o Postgres-de-test isolado, roda a suíte (Vitest + Supertest) no host e derruba ao final (inclusive em falha) |
| `pnpm run typecheck` | `tsc --noEmit` |
| `pnpm run lint` | Biome (`lint:fix` corrige o auto-corrigível) |
| `pnpm run dev:db` | Sobe só o Postgres-de-dev, detached (pré-requisito dos `db:*`) |
| `pnpm run db:migrate` | Cria/aplica uma migration nova em dev (autoria consciente) |
| `pnpm run db:studio` | Prisma Studio |
# Rodar em desenvolvimento (Docker)

Pré-requisitos: **Docker** (com Compose) e **Node 24** com o corepack ligado — os scripts do
`package.json` rodam via `pnpm`, e é o corepack que instala a versão exata pinada no campo
`packageManager` (nada de `npm i -g pnpm`). Tudo mais roda em container, inclusive o app — com
hot-reload via `tsx watch` lendo `src/` por bind-mount.

```bash
corepack enable                     # uma vez por máquina; o pnpm certo vem na primeira chamada
git clone <repo> && cd pet-oasis
cp .env.example .env.development   # preencha JWT_SECRET e PEPPER (≥ 32 chars cada)
pnpm run dev                        # Compose em foreground: db + mailpit + app
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
# Rodar em desenvolvimento (Docker)

Pré-requisito: **Docker** (com Compose). Tudo roda em container, inclusive o app — com hot-reload via `tsx watch` lendo `src/` por bind-mount.

```bash
git clone <repo> && cd pet-oasis
cp .env.example .env.development   # preencha JWT_SECRET e PEPPER (≥ 32 chars cada)
npm run dev                        # Compose em foreground: db + mailpit + app
```

Na subida o container aplica as migrations (`prisma migrate deploy`) e semeia features/roles (usuário demo só com `SEED_DEMO_USER=true`). Então acesse:

- API: `http://localhost:3000/api/v1`
- Referência interativa: `http://localhost:3000/reference`
- Mailpit (emails de dev): `http://localhost:8025` (SMTP `1025`)

`Ctrl+C` derruba tudo com shutdown gracioso.
`npm run dev:down`, `npm run dev:reset` (recria do zero, apagando o volume)
`npm run dev:mail` sobe só o Mailpit.

Comandos úteis:

| Comando | O quê |
|---|---|
| `npm test` | Sobe o Postgres-de-test isolado, roda a suíte (Vitest + Supertest) no host e derruba ao final (inclusive em falha) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | Biome (`lint:fix` corrige o auto-corrigível) |
| `npm run db:migrate` | Cria/aplica uma migration nova em dev (autoria consciente) |
| `npm run db:studio` | Prisma Studio |
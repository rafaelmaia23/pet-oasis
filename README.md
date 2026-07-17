# pet-oasis

API REST de um pet shop online — projeto real **e** veículo de aprendizado de TDD/clean code.

O **Ciclo 1** entrega a fundação da aplicação: autenticação (access JWT + refresh opaco rotativo), autorização RBAC com overrides por usuário, gestão de usuários e perfis, verificação de email, banimento e recuperação de senha. O roadmap completo está em [TODO.md](TODO.md) e o racional das decisões em [CONTEXT.md](CONTEXT.md).

## Stack

TypeScript (strict) · Node / Express 5 · Prisma 7 (driver adapter `pg`) · PostgreSQL · Zod 4 · JWT + bcrypt · Vitest + Supertest · Biome · Docker.

## Arquitetura

Fluxo em camadas, rígido — cada camada só fala com a adjacente:

```
route → controller (Zod parse) → service (regras de negócio) → repository (Prisma)
```

- **repository** é a única camada que toca o Prisma.
- **presenter** monta as views por *whitelist* Zod (nada sensível vaza — `passwordHash`/`tokenHash` nunca saem).
- **RBAC**: roles agregam features; `UserFeature` guarda só overrides (grant/deny). As features efetivas são computadas em runtime por `computeEffectiveFeatures` (`⋃ roles ∪ grants − denies`, `*` = admin).
- **Soft delete** (`deletedAt`) em User/perfis/vínculos, preservando histórico para auditoria.

O detalhe de cada decisão está no [CLAUDE.md](CLAUDE.md) (guia do projeto) e no [CONTEXT.md](CONTEXT.md) (o "porquê" longo).

## Documentação da API

- **[`GET /reference`](http://localhost:3000/reference)** — referência interativa (UI [Scalar](https://scalar.com)) com "try it".
- **[`GET /openapi.json`](http://localhost:3000/openapi.json)** — spec OpenAPI 3.1, gerada dos próprios schemas Zod (`.meta()`, sem monkey-patch).
- **[`api-collection/`](api-collection/)** — coleção [Bruno](https://www.usebruno.com/) versionada, organizada por módulo (environments `local` e `prod`).
- Índice interno enxuto das rotas em [ENDPOINTS.md](ENDPOINTS.md).

Ambas as rotas de documentação são **públicas** (não exigem token).

## Demo read-only

O ambiente Docker sobe com um usuário público **read-only** para explorar a API ao vivo:

| Campo | Valor |
|---|---|
| Email | `demo@petoasis.dev` |
| Senha | `DemoOasis2026!` |

A role `demo` tem **todas as features de leitura** — qualquer `GET` responde **200**, qualquer escrita responde **403** (o RBAC funcionando ao vivo). Faça login pela UI em `/reference` e experimente.

## Rodar em desenvolvimento (Docker)

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

`Ctrl+C` derruba tudo com shutdown gracioso. Outros: `npm run dev:down`, `npm run dev:reset` (recria do zero, apagando o volume), `npm run dev:mail` (só o Mailpit).

Comandos úteis:

| Comando | O quê |
|---|---|
| `npm test` | Sobe o Postgres-de-test isolado, roda a suíte (Vitest + Supertest) no host e derruba ao final (inclusive em falha) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | Biome (`lint:fix` corrige o auto-corrigível) |
| `npm run db:migrate` | Cria/aplica uma migration nova em dev (autoria consciente) |
| `npm run db:studio` | Prisma Studio |

## Deploy em produção

Produção sobe **só** o app + Postgres-de-prod (sem Mailpit nem banco de dev/test). O app é buildado e roda direto num VPS **ARM64**. No servidor:

```bash
git clone <repo> && cd pet-oasis
cp .env.example .env.production
```

Preencha o `.env.production`:

- `JWT_SECRET` e `PEPPER` — segredos fortes, ≥ 32 chars cada (`openssl rand -hex 32`; não reutilize os de dev).
- `POSTGRES_PASSWORD` — senha forte do banco.
- `APP_URL` — o domínio real do front (usado nos links de email).
- `MAIL_FROM` e `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS` — SMTP real (ex.: Resend, `smtp.resend.com:465`).
- `SEED_DEMO_USER=true` + `DEMO_*` — só se quiser o usuário demo público.

Então:

```bash
npm run prod:up    # build + up (só app + Postgres-de-prod); migrate deploy + seed no entrypoint
```

`npm run prod:down` derruba; `npm run prod:logs` acompanha. A migração roda via `prisma migrate deploy` (nunca `migrate dev`) e o seed é idempotente — a subida deixa o ambiente do zero funcionando.

> Fora do escopo da app (infra do servidor): reverse proxy/TLS (Caddy/nginx), backup do volume `prod_pgdata`, firewall.

## Status e roadmap

Ciclo 1 (fundação) com as fases 2–6 concluídas: autorização e perfis, auth com refresh rotativo, email/status/banimento, documentação + containerização e **ambientes dev/test/prod + deploy** (Compose base + overrides, graceful shutdown). À frente: **Fase 7** (hardening — rate limiting, account lockout, audit log, paginação) e **Fase 8** (domínio do pet shop — Pets ligados a Customers, e adiante vendas/pedidos). Detalhe em [TODO.md](TODO.md).

## Licença

ISC.

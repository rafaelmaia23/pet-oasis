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

## Subir com Docker (full-stack)

Pré-requisito: **Docker** (com Compose). Do zero:

```bash
git clone <repo> && cd pet-oasis
cp env.example .env          # preencha JWT_SECRET e PEPPER (≥ 32 chars cada)
npm run stack:up             # docker compose --profile full up -d --build
```

O container faz tudo na subida: aplica as migrations (`prisma migrate deploy`), semeia (features/roles + usuário demo) e sobe o servidor. Então acesse:

- API: `http://localhost:3000/api/v1`
- Referência interativa: `http://localhost:3000/reference`

Derrubar tudo: `npm run stack:down`.

## Desenvolvimento local (host + tsx)

Para desenvolver com hot-reload rodando o app no host e só a infra em container:

```bash
npm ci
cp env.example .env          # preencha JWT_SECRET e PEPPER (≥ 32 chars cada)
npm run services:up          # sobe apenas db, db_test e mailpit
npm run db:migrate           # aplica migrations no banco de dev
npm run db:seed              # semeia features/roles (demo só com SEED_DEMO_USER=true)
npm run dev                  # tsx watch em http://localhost:3000
```

Comandos úteis:

| Comando | O quê |
|---|---|
| `npm run test:run` | Suíte completa (Vitest + Supertest) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | Biome (`lint:fix` corrige o auto-corrigível) |
| `npm run db:studio` | Prisma Studio |

Emails em dev caem no **Mailpit** — UI em `http://localhost:8025` (SMTP `1025`).

## Deploy em servidor

O mesmo full-stack do Docker roda em produção. No servidor:

```bash
git clone <repo> && cd pet-oasis
cp env.example .env
```

Preencha o `.env` **para produção**:

- `JWT_SECRET` e `PEPPER` — segredos fortes, ≥ 32 chars cada (não reutilize os de dev).
- `APP_URL` — o domínio real do front (usado nos links de email).
- `MAIL_FROM` e `SMTP_*` — credenciais SMTP reais (ex.: Resend).
- `DEMO_EMAIL` / `DEMO_PASSWORD` — só se quiser manter o usuário demo público.

Então:

```bash
npm run stack:up
```

A migração roda via `prisma migrate deploy` no entrypoint (nunca `migrate dev`) e o seed é idempotente — a subida deixa o ambiente do zero funcionando.

> **🔸 Fora do escopo da aplicação** (responsabilidade de infra/deploy): reverse proxy + TLS (Caddy/nginx), backup do volume `postgres_data` do Postgres e firewall. CORS explícito ainda não está configurado — chega na Fase 6 (hardening).

## Status e roadmap

Ciclo 1 (fundação) com as fases 2–5 concluídas: autorização e perfis, auth com refresh rotativo, email/status/banimento e documentação + containerização. À frente: **Fase 6** (hardening — rate limiting, account lockout, audit log, paginação) e **Fase 7** (domínio do pet shop — Pets ligados a Customers, e adiante vendas/pedidos). Detalhe em [TODO.md](TODO.md).

## Licença

ISC.

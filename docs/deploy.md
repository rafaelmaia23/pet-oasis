# Deploy em produção

Produção sobe **só** o app + Postgres-de-prod. O app é buildado e roda direto num VPS **ARM64**. 

No servidor:

```bash
git clone <repo> && cd pet-oasis
cp .env.example .env.production
```

Preencher o `.env.production`:

- `JWT_SECRET` e `PEPPER` — segredos fortes, ≥ 32 chars cada (`openssl rand -hex 32`).
- `POSTGRES_PASSWORD` — senha forte do banco.
- `APP_URL` — o domínio real do front (usado nos links de email).
- `MAIL_FROM` e `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS` — SMTP para envio dos emails.
- `SEED_DEMO_USER=true` + `DEMO_*` — só se quiser o usuário demo público.

Então:

```bash
npm run prod:up    # build + up; migrate deploy + seed no entrypoint
```

`npm run prod:down` derruba; 
`npm run prod:logs` acompanha. 
A migração roda via `prisma migrate deploy` e o seed é idempotente — a subida deixa o ambiente do zero funcionando.

> Fora do escopo da app (infra do servidor): reverse proxy/TLS (Caddy/nginx), backup do volume `prod_pgdata`, firewall.
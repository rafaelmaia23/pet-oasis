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
- `UPLOAD_HOST_DIR` — o diretório **no host** que o Compose monta em `/app/uploads`. É bind
  mount, não volume nomeado: é o que permite, amanhã, o nginx servir `/uploads/` direto sem
  tocar em código nem no banco.
- `UPLOAD_PUBLIC_BASE_URL` — a base pública das URLs de imagem (`https://<domínio>/uploads`).
  O banco guarda só a **chave**; a URL é montada com isto na resposta.
- `SEED_FAKE_DATA=true` e `DEMO_MODE=true` — só num deploy de demonstração: povoam o
  catálogo fictício e liberam o `demo-reset` (truncate + reseed diário).

Criar o diretório de uploads antes da primeira subida — o container roda como o usuário
`node`, e um bind mount criado pelo Docker nasce de `root`:

```bash
mkdir -p "$UPLOAD_HOST_DIR" && sudo chown 1000:1000 "$UPLOAD_HOST_DIR"
```

Então:

```bash
npm run prod:up    # build + up; migrate deploy + seed no entrypoint
```

> ⚠️ **A imagem tem que ser construída no próprio servidor ARM.** É o que o `prod:up` faz (o
> Compose tem `build:`). Construir num x86 e enviar a imagem pronta quebra em runtime com
> "could not load the sharp module" — erro que não se parece nada com a causa, porque o
> `sharp` traz binário nativo por arquitetura.

`npm run prod:down` derruba; 
`npm run prod:logs` acompanha. 
A migração roda via `prisma migrate deploy` e o seed é idempotente — a subida deixa o ambiente do zero funcionando.

> Fora do escopo da app (infra do servidor): reverse proxy/TLS (Caddy/nginx), backup do volume `prod_pgdata`, firewall.
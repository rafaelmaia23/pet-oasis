# Deploy em produção

Produção sobe **só** a API + Postgres-de-prod. No Compose o serviço se chama **`api`** e o
container, **`pet-oasis-api`** — o nome do serviço é o que o DNS da rede publica, então é por
ele que um cliente interno (o front) alcança a API. É buildado e roda direto num VPS **ARM64**.

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

## Timers de manutenção

Os scripts de faxina (`cleanup-sessions`, `cleanup-audit-log` e, no deploy demo, `demo-reset`)
são agendados por systemd timer — passo manual, fora do Compose. Instalação, verificação e o
procedimento de troca das units estão em [`infra/cron/README.md`](../../infra/cron/README.md).

> ⚠️ Cada unit chama `docker exec pet-oasis-api …`, ou seja, **o nome do container está gravado
> nela**. Num deploy que renomeia o container, reinstale as units **antes** do `prod:up` e rode
> uma delas à mão **depois** dele (antes, o `docker exec` erra o nome por construção) — unit
> apontando para container inexistente falha em silêncio, só no journal.

> Fora do escopo da app (infra do servidor): reverse proxy/TLS (Caddy/nginx), backup do volume `prod_pgdata`, firewall.
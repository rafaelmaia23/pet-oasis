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

## Redes

O Compose de produção declara **três** redes, e o `up` falha se a do proxy não existir — o que é
a mensagem certa, e o motivo de ela ser declarada em vez de conectada à mão depois do deploy:

| Rede | Quem entra | Criada por |
|---|---|---|
| `backend` (`internal: true`) | `db`, `redis`, `api` | o próprio `prod:up` |
| `pet-oasis` | `api` + clientes internos (o front) | o próprio `prod:up` |
| `proxy` | `api` + nginx + clientes internos que o nginx serve | **fora deste repo**, uma vez |

A `proxy` é a única com pré-requisito. Se ainda não existir no host:

```bash
docker network create proxy   # idempotente na prática: erra se já existir
```

O nginx precisa estar nela (`docker network inspect proxy`) e passa a alcançar a API por
`http://api:3000` — **não** por `127.0.0.1:3000`. A porta 3000 não é mais publicada no host:

```nginx
proxy_pass http://api:3000;
```

> ⚠️ **Não republique a porta da API.** A ausência de publicação é o que torna seguro o
> `trust proxy` por endereço privado do `app.ts`: com a porta aberta na internet, qualquer um
> forja o próprio `X-Forwarded-For` e fura rate limit, lockout e audit log de uma vez. Para
> depurar de dentro do host, use `docker exec pet-oasis-api …` ou uma publicação temporária em
> `127.0.0.1:3000:3000`, nunca em `0.0.0.0`.

Cliente interno (o front) entra na `pet-oasis`, declarando-a como externa no compose dele. Estar
nela dá acesso à API e **só**: Postgres e Redis ficam na `backend`, que é `internal:` e não tem
rota para lugar nenhum. O contrato completo do lado do cliente está em
[`integrating-with-the-api.md`](integrating-with-the-api.md).

## Subir

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

### O que no seed derruba o boot, e o que só loga

O seed roda a cada boot do container, e **não** é tudo-ou-nada:

| Classe | O que é | Falhando |
|---|---|---|
| Dado de referência | features, roles, raças, léxico da busca | **para o boot** — é pré-requisito, como a migration |
| Dado de demonstração | usuário demo, admin de teste, dataset fake (`SEED_*`) | **só loga** em nível de erro; o servidor sobe |

Dado de demonstração não vale uma API fora do ar: uma falha de permissão gravando imagem do
catálogo fake já pôs este container em crash loop e o site inteiro em 502. Quando isso acontece, a
última linha do seed diz exatamente quais passos faltaram:

```
SEEDING COMPLETED WITH FAILURES: fake-catalog — dado de demonstração faltando; a API sobe assim mesmo.
```

Ou seja: **a API está no ar e incompleta**, não fora do ar. Corrigida a causa (quase sempre a
permissão do `UPLOAD_HOST_DIR` — ver o `chown` acima), rode o seed à mão, sem redeploy e sem
downtime:

```bash
docker exec pet-oasis-api node dist/seed.js
```

O seed é idempotente: o que já foi semeado é pulado, e só o que faltou entra. Se em vez disso o
**boot** parou, o `prod:logs` mostra o erro e o container reiniciando — aí a falha é de dado de
referência (ou do banco), e é para parar mesmo.

## Timers de manutenção

Os scripts de faxina (`cleanup-sessions`, `cleanup-audit-log` e, no deploy demo, `demo-reset`)
são agendados por systemd timer — passo manual, fora do Compose. Instalação, verificação e o
procedimento de troca das units estão em [`infra/cron/README.md`](../../infra/cron/README.md).

> ⚠️ Cada unit chama `docker exec pet-oasis-api …`, ou seja, **o nome do container está gravado
> nela**. Num deploy que renomeia o container, reinstale as units **antes** do `prod:up` e rode
> uma delas à mão **depois** dele (antes, o `docker exec` erra o nome por construção) — unit
> apontando para container inexistente falha em silêncio, só no journal.

> Fora do escopo da app (infra do servidor): reverse proxy/TLS (Caddy/nginx), backup do volume `prod_pgdata`, firewall.
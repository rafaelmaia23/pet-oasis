# Deploy da API em produção

**Pré-requisito: o stack existe.** A API é o serviço `api` do stack de produção do monorepo, e
o que vale para o stack inteiro — preparar o host, as redes, os proxy hosts, `prod:up`/`down`/
`logs`, o aviso de construir no próprio ARM — está em
[`docs/guides/deploy.md`](../../../../docs/guides/deploy.md) da raiz. Este guia é o que é **só
da API**: as variáveis dela, o diretório de uploads, o que o seed derruba, os timers e como
conferir que ela está inteira.

Deploy só da API, da raiz do monorepo:

```bash
pnpm prod:up api    # rebuild + restart só dela; o web segue na imagem que já tinha
```

O container se chama **`pet-oasis-api`** e o serviço, `api` — é por `api` que o front a alcança
por dentro (`http://api:3000`, pela rede `frontend`). Nenhum dos dois nomes mudou na migração
para o monorepo, o que importa para os timers abaixo.

## O `.env.production` da API

Mora em `apps/api/.env.production`, fora do git, copiado do `.env.example` ao lado. Ele é
também o `--env-file` de **interpolação** do Compose — é de lá que saem `POSTGRES_*` e
`UPLOAD_HOST_DIR` —, então sem ele o stack inteiro não sobe, não só a API.

- `JWT_SECRET` e `PEPPER` — segredos fortes, ≥ 32 chars cada (`openssl rand -hex 32`).
- `POSTGRES_PASSWORD` — senha forte do banco.
- `APP_URL` — o domínio real do **front** (usado nos links de email), não o da API. Os dois são
  hosts diferentes: ver [Domínio e reverse proxy](../../../../docs/guides/deploy.md#domínio-e-reverse-proxy)
  no guia do stack.
- `MAIL_FROM` e `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS` — SMTP para envio dos emails.
- `SEED_DEMO_USER=true` + `DEMO_*` — só se quiser o usuário demo público.
- `UPLOAD_HOST_DIR` — o diretório **no host** que o Compose monta em `/app/uploads`. É bind
  mount, não volume nomeado: é o que permite, amanhã, o nginx servir `/uploads/` direto sem
  tocar em código nem no banco. **Obrigatória**: sem ela o `prod:up` falha nomeando a variável,
  e o caminho precisa ser **absoluto e fora do working tree** do repo clonado (ver abaixo).
  Absoluto não é preciosismo: fonte relativa de bind mount resolve contra o **diretório do
  projeto** do Compose, que é o do primeiro `-f` — `infra/`, não a raiz do repo. `./uploads`
  aqui significaria `<repo>/infra/uploads` (é por isso que o compose de dev pede
  `../apps/api/uploads`).
- `UPLOAD_PUBLIC_BASE_URL` — a base pública das URLs de imagem, no host da **API**
  (`https://pet-oasis-api.maiahub.com.br/uploads`). Quem serve o byte é a API, então é o
  certificado dela que cobre o endereço. O banco guarda só a **chave**; a URL é montada com
  isto na resposta, o que faz trocar de host custar uma variável e nenhuma migration.
- `SEED_FAKE_DATA=true` e `DEMO_MODE=true` — só num deploy de demonstração: povoam o catálogo
  fictício e liberam o `demo-reset` (truncate + reseed diário).

## Diretório de uploads

O diretório de dados fica **fora do working tree** do repo clonado, e isso não é preferência de
arrumação. Dentro da árvore ele tem dois donos incompatíveis — o git escreve como o usuário do
host (uid 1001 no servidor), o container escreve como uid 1000 — e não existe dono que satisfaça
os dois. Já custou dois incidentes: um `pull` abortado por `Permission denied`, deixando o
checkout pela metade, e um `EACCES` no seed. Fora da árvore, o git nunca toca no caminho, e uma
limpeza de arquivos não rastreados no repo não alcança o que foi enviado.

O uid **1000 está fixado no serviço** (`user: "1000:1000"` em `infra/docker-compose.prod.yml`),
em vez de herdado do `USER node` da imagem base — é o mesmo par que o `chown` abaixo usa, e os
dois mudam juntos ou nenhum.

Criar o diretório antes da primeira subida — um bind mount criado pelo Docker nasce de `root`, e
o container não escreveria nele:

```bash
sudo mkdir -p /srv/pet-oasis-data/uploads
sudo chown -R 1000:1000 /srv/pet-oasis-data/uploads
```

É o **número** que importa, não o nome: `1000:1000` é o `user:` do serviço, e um `ls -la` vai
mostrá-lo com o nome que o host der a esse uid (`opc`, `ubuntu`, o que for). Conferir com
`id -u <nome>` antes de confiar no nome.

### Não há deploy para migrar — mas há bytes a regravar

Nenhum deploy com dados antecede este layout, então não há diretório a mover. Mas o volume do
banco sobrevive ao redeploy e o seed não regrava o que o banco já tem — se as linhas de imagem
apontam para bytes que ficaram para trás, a API sobe limpa e toda imagem responde 404. No demo,
o conserto é repovoar:

```bash
sudo systemctl start pet-oasis-demo-reset.service     # trunca e repovoa, gravando no mount novo
ls /srv/pet-oasis-data/uploads                          # brands  pets  products
```

Racional em [`docs/adr/0162`](../adr/0162-diretorio-uploads-mora-fora-working-tree-uid-fixado.md).

## Migração e seed

A migração roda via `prisma migrate deploy` no entrypoint do container, e o seed é idempotente —
a subida deixa o ambiente do zero funcionando.

### O que no seed derruba o boot, e o que só loga

O seed roda a cada boot do container, e **não** é tudo-ou-nada:

| Classe | O que é | Falhando |
|---|---|---|
| Dado de referência | features, roles, raças, léxico da busca | **para o boot** — é pré-requisito, como a migration |
| Dado de demonstração | usuário demo, admin de teste, dataset fake (`SEED_*`) | **só loga** em nível de erro; o servidor sobe |

Dado de demonstração não vale uma API fora do ar: uma falha de permissão gravando imagem do
catálogo fake já pôs este container em crash loop e o site inteiro em 502. Quando isso acontece,
a última linha do seed diz exatamente quais passos faltaram:

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
**boot** parou, o `pnpm prod:logs api` mostra o erro e o container reiniciando — aí a falha é de
dado de referência (ou do banco), e é para parar mesmo.

## O proxy host da API

A forma do proxy host (DNS na Cloudflare, certificado por desafio DNS, destino por nome de
container, `real_ip_header`) é a mesma dos dois apps e está no
[guia do stack](../../../../docs/guides/deploy.md#o-que-cada-proxy-host-precisa-ter). O que é
da API:

- Destino `http://pet-oasis-api:3000`, e **nunca `127.0.0.1:3000`** — a porta não é publicada
  no host, e é essa ausência que torna seguro o `trust proxy` por endereço privado do `app.ts`.
  Para depurar de dentro do host, use `docker exec pet-oasis-api …` ou uma publicação
  temporária em `127.0.0.1:3000:3000`, nunca em `0.0.0.0`.
- O redirect da raiz (`/` → `/reference`) que o host público faz é do **NPM**, não da
  aplicação: a API não tem rota `/`.

## Timers de manutenção

Os scripts de faxina (`cleanup-sessions`, `cleanup-audit-log` e, no deploy demo, `demo-reset`)
são agendados por systemd timer — passo manual, fora do Compose. Instalação, verificação e o
procedimento de troca das units estão em [`infra/cron/README.md`](../../infra/cron/README.md).

> ⚠️ Cada unit chama `docker exec pet-oasis-api …`, ou seja, **o nome do container está gravado
> nela**. Num deploy que renomeia o container, reinstale as units **antes** do `prod:up` e rode
> uma delas à mão **depois** dele (antes, o `docker exec` erra o nome por construção) — unit
> apontando para container inexistente falha em silêncio, só no journal.
>
> A migração para o monorepo **não** renomeou nada: `container_name: pet-oasis-api` continua o
> mesmo em `infra/docker-compose.prod.yml`, e as três units sobrevivem sem reinstalação. O que
> mudou é de onde se roda o `prod:up` (a raiz do monorepo, não `apps/api`).

## Verificar a API

```bash
# TLS válido e a API respondendo no host
curl -sS -o /dev/null -w '%{http_code} %{ssl_verify_result}\n' \
  https://pet-oasis-api.maiahub.com.br/api/v1/status        # 200 0

# Uma imagem do catálogo servida pelo host da API
curl -sS -o /dev/null -w '%{http_code}\n' \
  "$(curl -s 'https://pet-oasis-api.maiahub.com.br/api/v1/products?limit=1' \
     | grep -o 'https://[^"]*\.webp' | head -1)"          # 200

# A cadeia de IP pela Cloudflare: um login recusado, vindo de fora do servidor,
# tem que gravar em audit_logs o IP de QUEM chamou — não 2606:4700::/104.x
# (Cloudflare) nem 172.x (a rede docker do NPM).
curl -sS -o /dev/null -w '%{http_code}\n' \
  -H 'Content-Type: application/json' \
  -d '{"email":"nobody@example.com","password":"wrong"}' \
  https://pet-oasis-api.maiahub.com.br/api/v1/auth/login    # 401
docker exec -i pet-oasis-prod-db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
select ip, created_at from audit_logs
 where action = 'AUTH_LOGIN_FAILED' order by created_at desc limit 1;
SQL
```

O contrato completo do lado de quem consome a API está em
[`integrating-with-the-api.md`](integrating-with-the-api.md).

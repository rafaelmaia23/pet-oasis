# Deploy em produção

Produção é **um stack só**, do sistema inteiro: `api` + `web` + Postgres-de-prod + Redis, sem
mailpit. Os arquivos Compose vivem em `infra/` da **raiz** do monorepo e os scripts `prod:*`
também, porque o stack é do sistema e não de um app — o porquê está em
[`docs/adr/0007`](../../../../docs/adr/0007-single-compose-stack-one-image-per-app.md) da raiz.
No Compose os serviços se chamam **`api`** e **`web`**, e os containers, **`pet-oasis-api`** e
**`pet-oasis-web`** — o nome do serviço é o que o DNS da rede publica, então é por `api` que o
front alcança a API por dentro. Tudo é buildado e roda direto num VPS **ARM64**.

Este guia mora no `docs/` da API porque quase todo o detalhe operacional é dela (migrations,
seed, uploads, cadeia de IP, timers); o que é do web está marcado onde aparece.

**Um stack, dois tempos de deploy.** `pnpm prod:up` sobe o sistema; `pnpm prod:up api` (ou
`web`) reconstrói e reinicia **só** aquele serviço, com o outro seguindo na imagem que já
tinha. A API anda à frente do front, e o deploy de uma não derruba o outro.

No servidor, Node 24 com corepack — os `prod:*` rodam via `pnpm`, e o corepack instala a versão
pinada no `packageManager` do `package.json` da raiz (nenhum Dockerfile escreve versão de pnpm;
ver [`docs/adr/0006`](../../../../docs/adr/0006-one-source-for-node-pnpm-and-one-version-per-dependency.md)).
O VPS clona o **monorepo inteiro**, e é da raiz dele que se opera. O build de cada imagem usa a
raiz como contexto (é onde estão o lockfile e o workspace — ver
[o contexto de build](../adr/0156-contexto-build-raiz-monorepo-runtime-podado-pnpm-deploy.md)):

```bash
corepack enable                            # uma vez por máquina
git clone <repo> && cd pet-oasis           # a RAIZ do monorepo; é daqui que se roda tudo
cp apps/api/.env.example apps/api/.env.production
cp apps/web/.env.example apps/web/.env.production
```

**Os dois arquivos precisam existir**, cada um dentro do app que é dono dele. O da API é
também o `--env-file` de interpolação do Compose (é de lá que saem `POSTGRES_*` e
`UPLOAD_HOST_DIR`). O do web pode estar **vazio de variáveis** por enquanto, e mesmo assim tem
de existir: o Compose o lê como `env_file`, e é a garantia de que quem faz o deploy leu o
`.env.example` dele.

Preencher o `apps/api/.env.production`:

- `JWT_SECRET` e `PEPPER` — segredos fortes, ≥ 32 chars cada (`openssl rand -hex 32`).
- `POSTGRES_PASSWORD` — senha forte do banco.
- `APP_URL` — o domínio real do **front** (usado nos links de email), não o da API. Os dois
  são hosts diferentes: ver [Domínio e reverse proxy](#domínio-e-reverse-proxy) abaixo.
- `MAIL_FROM` e `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS` — SMTP para envio dos emails.
- `SEED_DEMO_USER=true` + `DEMO_*` — só se quiser o usuário demo público.
- `UPLOAD_HOST_DIR` — o diretório **no host** que o Compose monta em `/app/uploads`. É bind
  mount, não volume nomeado: é o que permite, amanhã, o nginx servir `/uploads/` direto sem
  tocar em código nem no banco. **Obrigatória**: sem ela o `prod:up` falha nomeando a variável,
  e o caminho precisa ser **absoluto e fora do working tree** do repo clonado (ver abaixo).
  Absoluto não é preciosismo: fonte relativa de bind mount resolve contra o **diretório do
  projeto** do Compose, que é o do primeiro `-f` — `infra/`, não a raiz do repo. `./uploads`
  aqui significaria `<repo>/infra/uploads` (é por isso que o compose de dev pede `../uploads`).
- `UPLOAD_PUBLIC_BASE_URL` — a base pública das URLs de imagem, no host da **API**
  (`https://pet-oasis-api.maiahub.com.br/uploads`). Quem serve o byte é a API, então é o
  certificado dela que cobre o endereço. O banco guarda só a **chave**; a URL é montada com
  isto na resposta, o que faz trocar de host custar uma variável e nenhuma migration.
- `SEED_FAKE_DATA=true` e `DEMO_MODE=true` — só num deploy de demonstração: povoam o
  catálogo fictício e liberam o `demo-reset` (truncate + reseed diário).

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

Racional em `docs/adr/0162-diretorio-uploads-mora-fora-working-tree-uid-fixado.md`.

## Redes

O Compose de produção declara **três** redes, com papéis distintos. A API é o único serviço nas
três — é ela que atravessa a fronteira entre os dados e quem os pede:

| Rede | Quem entra | Criada por |
|---|---|---|
| `backend` (`internal: true`) | `db`, `redis`, `api` | o próprio `prod:up` |
| `frontend` | `api` + `web` | o próprio `prod:up` — é **do stack** |
| `proxy` | `api`, `web`, o nginx e o que mais ele servir | **fora deste repo**, uma vez |

A rede entre a API e o front é **do stack**, e não mais `external:` — é a mudança que o
monorepo trouxe. A `pet-oasis` externa da Fase 10 existia porque ligava **dois** stacks, cada
um no seu repositório, e rede que liga stacks vive mais que qualquer um deles; com os dois
serviços no mesmo stack, a rede nasce no `up` e morre no `down`, e "o up do web falhou porque a
rede da API não existe" deixa de ser possível por construção
([`docs/adr/0007`](../../../../docs/adr/0007-single-compose-stack-one-image-per-app.md)).

A `proxy` continua externa porque o reverse proxy é de fora do repositório, e o `up` **falha se
ela não existir** — o que é a mensagem certa, e o motivo de ela ser declarada em vez de
conectada à mão depois de cada deploy. Em host novo, antes do primeiro `prod:up`:

```bash
docker network create proxy   # inofensivo se já existir: erra dizendo que existe
```

> Host que rodou a versão anterior deste compose tem uma rede `pet-oasis` órfã: ela existia
> para ligar os dois stacks que agora são um, e nenhum serviço a declara mais. Removê-la é
> parte da transição de host — `docker network rm pet-oasis`, depois que o stack novo subir e
> os dois containers responderem. Deixá-la para trás não quebra nada, mas guarda um nome que
> um projeto futuro pode reusar acreditando que é o nosso.

O NPM precisa estar nela (`docker network inspect proxy`) e passa a alcançar a API por
`http://pet-oasis-api:3000` — o **nome do container**, não o alias `api`, e **não**
`127.0.0.1:3000`. A porta 3000 não é mais publicada no host:

```nginx
proxy_pass http://pet-oasis-api:3000;
```

Por que o nome do container e não `api`: a `proxy` é compartilhada com todo projeto que o NPM
serve neste host, e `api` é o nome genérico que um segundo projeto mais provavelmente usaria.
Dois containers respondendo pelo mesmo nome viram round-robin no DNS do Docker, e o proxy passa
a alternar entre as duas APIs sem erro nenhum. Por isso o compose de produção **não** declara o
alias `api` na `proxy` (só nas redes exclusivas do projeto, onde ele é contrato com o front).

> ⚠️ **Não republique a porta da API.** A ausência de publicação é o que torna seguro o
> `trust proxy` por endereço privado do `app.ts`: com a porta aberta na internet, qualquer um
> forja o próprio `X-Forwarded-For` e fura rate limit, lockout e audit log de uma vez. Para
> depurar de dentro do host, use `docker exec pet-oasis-api …` ou uma publicação temporária em
> `127.0.0.1:3000:3000`, nunca em `0.0.0.0`.

O front entra na `frontend`, que o próprio stack cria, e alcança a API por `http://api:3000`
— o nome do serviço, que o DNS da rede publica. Estar nela dá acesso à API e **só**: Postgres e
Redis ficam na `backend`, que é `internal:` e não tem rota para lugar nenhum, e o web não entra
nela. O contrato completo do lado do cliente está em
[`integrating-with-the-api.md`](integrating-with-the-api.md).

O `web` também não publica porta: o nginx o alcança por `http://pet-oasis-web:3001`, pela
`proxy`, pelo mesmo motivo da API — porta publicada é um caminho que desvia do TLS e do rate
limit da frente.

## Domínio e reverse proxy

A API atende em **`pet-oasis-api.maiahub.com.br`**. O apex (`pet-oasis.maiahub.com.br`) é do
front e fica **limpo**: nenhum caminho da API é redirecionado a partir dele. Quem chama a API
usa a base do subdomínio — o README e a coleção Bruno (`api-collection/environments/prod.bru`)
já apontam para lá. O porquê do nome (primeiro nível sob `maiahub.com.br`, e não
`api.pet-oasis.…`) e o de não haver redirect estão em `docs/adr/0160-api-atende-num-subdominio-apex-fica-limpo.md`.

O reverse proxy é o **Nginx Proxy Manager** (NPM), e a configuração dele **não vive neste
repositório** — é do servidor pessoal que hospeda a demo, pelo mesmo motivo registrado em
`docs/adr/0161-reverse-proxy-upload-existe-nao-neste-repositorio.md`. O que segue é a **forma** que ela precisa ter; versionar uma cópia aqui só criaria duas
verdades divergindo em silêncio.

### O que o proxy host precisa ter

São **dois** proxy hosts desde o monorepo — o do apex, que serve o front, e o do subdomínio,
que serve a API. O que segue descreve o da API; o do front é o mesmo desenho com o nome e o
destino trocados (`pet-oasis.maiahub.com.br` → `http://pet-oasis-web:3001`), e o item 4 vale
para os dois.

1. **DNS.** Registro `A` de `pet-oasis-api.maiahub.com.br` na Cloudflare, **proxiado** como os
   demais registros do domínio. O nome é de primeiro nível de propósito: o Universal SSL da
   Cloudflare cobre o apex e `*.maiahub.com.br`, e nada além — um nome de segundo nível não tem
   certificado na borda e falha no handshake TLS antes de a requisição chegar ao servidor.
2. **Certificado** Let's Encrypt emitido pelo NPM por **desafio DNS** na Cloudflare (token de API
   com permissão de editar a zona). É o desafio que funciona atrás do proxy da Cloudflare, onde a
   porta 80 do servidor não é o que o mundo vê.
3. **Proxy host** `pet-oasis-api.maiahub.com.br` → `http://pet-oasis-api:3000`. O NPM alcança a
   API por **DNS de container**, na rede `proxy` (`docker network inspect proxy` tem que listar
   o container do NPM). `pet-oasis-api` é o nome do container; `api` é o alias que o compose
   declara e resolve igual. **NUNCA `127.0.0.1:3000`** — a porta não é publicada no host, e é
   essa ausência que torna seguro o `trust proxy` por endereço privado (ver "Redes", acima).
4. **Custom config** do proxy host (a aba *Advanced* do NPM, que entra no nível do `server`):

   ```nginx
   real_ip_header CF-Connecting-IP;
   real_ip_recursive off;
   ```

   É o que mantém verdadeira a cadeia de IP da 10.2 com a Cloudflare na frente: sem isto o
   `X-Forwarded-For` que chega à API termina na borda da Cloudflare, o `trust proxy` para
   nela, e todo visitante cai num balde só de rate limit. O NPM já confia nas faixas da
   Cloudflare (`set_real_ip_from`, em `ip_ranges.conf`); as duas linhas fazem o `$remote_addr`
   virar o visitante. Vale para **todo** proxy host que receba visitante pela Cloudflare — o da
   API e o do apex. O porquê completo está em
   `docs/adr/0160-api-atende-num-subdominio-apex-fica-limpo.md`.

O redirect da raiz (`/` → `/reference`) que o host público faz é do **NPM**, não da aplicação —
a API não tem rota `/`.

O que o NPM gera é o equivalente a este `location`, e é isto que qualquer outro reverse proxy
precisaria reproduzir — os quatro `proxy_set_header` são o contrato do `trust proxy`:

```nginx
location / {
    proxy_pass http://pet-oasis-api:3000;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

### Verificar

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

## Subir

Sempre **da raiz do monorepo** — os `prod:*` são scripts da raiz:

```bash
pnpm prod:up          # o sistema inteiro: db, redis, api, web
pnpm prod:up api      # só a API: rebuild + restart dela; o web segue na imagem que já tinha
pnpm prod:up web      # só o front, idem
```

O deploy de um serviço só é a razão de o stack ser argumentável, e funciona nas duas direções
porque o `web` **não** declara `depends_on: api` — se declarasse, `up --build web`
reconstruiria a API por arrasto. Para conferir que o outro serviço não foi tocado, compare o
`StartedAt` antes e depois:

```bash
docker inspect -f '{{.State.StartedAt}} {{.Image}}' pet-oasis-api pet-oasis-web
```

> ⚠️ **As imagens têm que ser construídas no próprio servidor ARM.** É o que o `prod:up` faz (o
> Compose tem `build:`). Construir num x86 e enviar a imagem pronta quebra em runtime com
> "could not load the sharp module" — erro que não se parece nada com a causa, porque o
> `sharp` traz binário nativo por arquitetura.

`pnpm prod:down` derruba o stack; `pnpm prod:logs` acompanha os logs (dos dois serviços, ou de
um: `pnpm prod:logs api`). A migração roda via `prisma migrate deploy` no entrypoint da API e o
seed é idempotente — a subida deixa o ambiente do zero funcionando.

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
>
> A migração para o monorepo **não** renomeou nada: `container_name: pet-oasis-api` continua o
> mesmo em `infra/docker-compose.prod.yml`, e as três units sobrevivem sem reinstalação. O que
> mudou é de onde se roda o `prod:up` (a raiz do monorepo, não `apps/api`).

> Fora do escopo da app (infra do servidor): backup do volume `prod_pgdata`, firewall. O
> reverse proxy e o TLS também moram fora do repositório, mas a forma que precisam ter está
> escrita acima, em [Domínio e reverse proxy](#domínio-e-reverse-proxy) — é a peça sem a qual
> a API não é alcançável pelo público.
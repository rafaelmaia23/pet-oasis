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

### Não há deploy para migrar

Nenhum deploy com dados antecede este layout: quando ele entrou, não havia produção, e o demo
(ainda sem `uploads/`) foi recriado do zero — `npm run prod:down`, `UPLOAD_HOST_DIR` absoluto no
`.env.production`, `npm run prod:up`. Não há diretório a mover nem contagem a conferir.

## Redes

O Compose de produção declara **três** redes, e o `up` falha se qualquer das duas compartilhadas
não existir — o que é a mensagem certa, e o motivo de elas serem declaradas em vez de conectadas à
mão depois do deploy:

| Rede | Quem entra | Criada por |
|---|---|---|
| `backend` (`internal: true`) | `db`, `redis`, `api` | o próprio `prod:up` |
| `pet-oasis` | `api` + clientes internos (o front) | **fora deste repo**, uma vez |
| `proxy` | `api` + nginx + clientes internos que o nginx serve | **fora deste repo**, uma vez |

As duas compartilhadas são `external:` pelo mesmo motivo: rede que liga stacks diferentes vive
mais que qualquer uma delas. Se a `pet-oasis` fosse gerenciada por este compose, o `prod:down`
a apagaria sempre que o front também estivesse fora — e o front, que a declara externa, passaria
a recusar subir até a API voltar. Em host novo, antes do primeiro `prod:up`:

```bash
docker network create proxy       # inofensivo se já existir: erra dizendo que existe
docker network create pet-oasis   # idem
```

> Host que já rodou uma versão anterior deste compose pode ter a `pet-oasis` criada pelo próprio
> Compose. Não faz diferença: `external:` só exige que ela exista, e o `create` erra dizendo que
> já existe — siga em frente.

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

## Domínio e reverse proxy

A API atende em **`pet-oasis-api.maiahub.com.br`**. O apex (`pet-oasis.maiahub.com.br`) é do
front e fica **limpo**: nenhum caminho da API é redirecionado a partir dele. Quem chama a API
usa a base do subdomínio — o README e a coleção Bruno (`api-collection/environments/prod.bru`)
já apontam para lá. O porquê do nome (primeiro nível sob `maiahub.com.br`, e não
`api.pet-oasis.…`) e o de não haver redirect estão em `docs/context/infrastructure.md`
§ "A API atende num subdomínio, e o apex fica limpo (10.6)".

O reverse proxy é o **Nginx Proxy Manager** (NPM), e a configuração dele **não vive neste
repositório** — é do servidor pessoal que hospeda a demo, pelo mesmo motivo registrado em
`docs/context/infrastructure.md` § "O reverse proxy do upload existe, mas não neste repositório
(9.10)". O que segue é a **forma** que ela precisa ter; versionar uma cópia aqui só criaria duas
verdades divergindo em silêncio.

### O que o proxy host precisa ter

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
   API e, quando o front subir, o do apex. O porquê completo está em
   `docs/context/infrastructure.md` § "A API atende num subdomínio, e o apex fica limpo (10.6)".

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

> Fora do escopo da app (infra do servidor): backup do volume `prod_pgdata`, firewall. O
> reverse proxy e o TLS também moram fora do repositório, mas a forma que precisam ter está
> escrita acima, em [Domínio e reverse proxy](#domínio-e-reverse-proxy) — é a peça sem a qual
> a API não é alcançável pelo público.
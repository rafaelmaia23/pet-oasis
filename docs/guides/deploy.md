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
- `UPLOAD_PUBLIC_BASE_URL` — a base pública das URLs de imagem, no host da **API**
  (`https://api.pet-oasis.maiahub.com.br/uploads`). Quem serve o byte é a API, então é o
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

### Migrar um deploy que ainda tem `uploads/` dentro do repo

**A ordem importa, e é o passo fácil de errar:** esta mudança apaga `uploads/.gitkeep` do
repositório, então o próprio `pull` que traz o deploy precisa *escrever* dentro de `uploads/` —
e é exatamente essa escrita que já falhou uma vez. Mover o diretório **antes** de atualizar o
código faz o `pull` não ter nada para apagar ali.

Mover, não copiar-e-torcer: `mv` dentro do mesmo filesystem é atômico por entrada, e o `-T` faz
o destino ser o próprio diretório em vez de virar um aninhado dentro dele. Com a stack
**parada**, para que nada esteja gravando durante a troca:

```bash
cd /srv/pet-oasis                      # o repo clonado
npm run prod:down

find uploads -type f | wc -l           # a contagem de antes; anote

# 1. sair da árvore ANTES de atualizar o código
sudo mkdir -p /srv/pet-oasis-data
sudo mv -T uploads /srv/pet-oasis-data/uploads
sudo chown -R 1000:1000 /srv/pet-oasis-data/uploads

find /srv/pet-oasis-data/uploads -type f | wc -l   # tem de bater com a de antes

# 2. só agora o código novo — sem `uploads/` na árvore, nada a apagar lá dentro
git pull

# 3. UPLOAD_HOST_DIR=/srv/pet-oasis-data/uploads no .env.production, e então
npm run prod:up
```

As duas contagens baterem é o que prova que nada ficou para trás. **Nenhuma linha do banco
muda**: ele guarda a *chave* do arquivo, e a URL pública nasce de `UPLOAD_PUBLIC_BASE_URL` a
cada resposta — mudar onde o byte mora é configuração, não migração de dados.

Se `/srv/pet-oasis-data` estiver em outro filesystem, o `mv` copia em vez de renomear: mesma
ordem, só mais lento, e a conferência de contagem passa a valer também como pré-requisito para
apagar a origem.

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
docker network create proxy       # idempotente na prática: erra se já existir
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

A API atende em **`api.pet-oasis.maiahub.com.br`**. O apex (`pet-oasis.maiahub.com.br`) está a
caminho de ser do front — enquanto a virada não acontece ele continua servindo a API —, e o que
fica nele em definitivo é um resíduo: **301** dos dois caminhos de documentação que já foram
publicados, para que link em README, badge e post não morra quando a virada vier.

| Caminho no apex | Resposta |
|---|---|
| `/reference` | `301` → `https://api.pet-oasis.maiahub.com.br/reference` |
| `/openapi.json` | `301` → `https://api.pet-oasis.maiahub.com.br/openapi.json` |

São **só** esses dois. `/api/v1/*` no apex não é redirecionado: quem chama a API troca a base
para o subdomínio, e o README e a coleção Bruno (`api-collection/environments/prod.bru`) já
apontam para lá.

A configuração do nginx **não vive neste repositório** — é do servidor pessoal que hospeda a
demo, pelo mesmo motivo registrado em `docs/context/infrastructure.md` § "O reverse proxy do
upload existe, mas não neste repositório (9.10)". O que segue é a **forma** que ela precisa ter;
versionar uma cópia aqui só criaria duas verdades divergindo em silêncio.

### A ordem, que não é livre

O `certbot --nginx` não cria o server block: ele **acha** o que já tem o `server_name`, valida
por HTTP-01 na porta 80 e escreve as linhas de TLS dentro dele. Fazer na ordem errada dá um erro
que parece de configuração do nginx e é de DNS, ou um certbot que não encontra o que editar.

1. **Registro `A`** de `api.pet-oasis.maiahub.com.br`, apontando para o mesmo IP do apex.
   Conferir que resolve (`dig +short api.pet-oasis.maiahub.com.br`) antes de seguir — a
   validação bate no nome, e sem registro ela falha.
2. **Server block do subdomínio em HTTP**, com o `proxy_pass`, e `nginx -t && systemctl reload
   nginx`.
3. **`certbot`**, com os **dois** nomes num certificado só (é uma expansão da linhagem que já
   existe para o apex, então o caminho em `/etc/letsencrypt/live/` continua sendo o do apex):

   ```bash
   sudo certbot --nginx -d pet-oasis.maiahub.com.br -d api.pet-oasis.maiahub.com.br
   ```

   Ele escreve o `listen 443 ssl`, as duas linhas de `ssl_certificate` e o bloco de redirect
   80 → 443 sozinho.
4. **Os dois `location` de 301** no server block do apex, e recarregar de novo.

### A forma final

Depois do passo 4, é isto que os dois blocos precisam ter (as linhas que o certbot escreveu
estão marcadas):

```nginx
# O subdomínio: é ele que serve a API.
server {
    listen 443 ssl;                                                        # certbot
    server_name api.pet-oasis.maiahub.com.br;

    ssl_certificate     /etc/letsencrypt/live/pet-oasis.maiahub.com.br/fullchain.pem;  # certbot
    ssl_certificate_key /etc/letsencrypt/live/pet-oasis.maiahub.com.br/privkey.pem;    # certbot

    location / {
        # Por DNS de container, na rede `proxy`. NUNCA 127.0.0.1:3000 — a porta
        # não é publicada no host, e é essa ausência que torna seguro o
        # `trust proxy` por endereço privado.
        proxy_pass http://api:3000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# O apex: os dois links publicados continuam chegando.
server {
    listen 443 ssl;                                                        # certbot
    server_name pet-oasis.maiahub.com.br;

    ssl_certificate     /etc/letsencrypt/live/pet-oasis.maiahub.com.br/fullchain.pem;  # certbot
    ssl_certificate_key /etc/letsencrypt/live/pet-oasis.maiahub.com.br/privkey.pem;    # certbot

    location = /reference {
        return 301 https://api.pet-oasis.maiahub.com.br$request_uri;
    }
    location = /openapi.json {
        return 301 https://api.pet-oasis.maiahub.com.br$request_uri;
    }

    # ... o resto do apex.
}
```

`$request_uri` em vez do caminho literal preserva a query string — é o que faz um
`/reference?foo=bar` chegar inteiro do outro lado.

### Verificar

```bash
# TLS válido e a API respondendo no host novo
curl -sS -o /dev/null -w '%{http_code} %{ssl_verify_result}\n' \
  https://api.pet-oasis.maiahub.com.br/api/v1/status        # 200 0

# Os dois links publicados, ainda chegando
curl -sSI https://pet-oasis.maiahub.com.br/reference    | head -2   # 301 + Location
curl -sSI https://pet-oasis.maiahub.com.br/openapi.json | head -2   # 301 + Location

# Uma imagem do catálogo pelo host novo
curl -sS -o /dev/null -w '%{http_code}\n' \
  "$(curl -s 'https://api.pet-oasis.maiahub.com.br/api/v1/products?limit=1' \
     | grep -o 'https://[^"]*\.webp' | head -1)"          # 200
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
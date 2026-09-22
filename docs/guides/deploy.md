# Deploy do stack de produção

Produção é **um stack só**, do sistema inteiro: `api` + `web` + Postgres-de-prod + Redis, sem
mailpit. Os arquivos Compose vivem em [`infra/`](../../infra/) e os scripts `prod:*` no
`package.json` da **raiz**, porque o stack é do sistema e não de um app — o porquê está em
[`adr/0007`](../adr/0007-single-compose-stack-one-image-per-app.md). No Compose os serviços se
chamam **`api`** e **`web`**, e os containers, **`pet-oasis-api`** e **`pet-oasis-web`** — o
nome do serviço é o que o DNS da rede publica, então é por `api` que o front alcança a API por
dentro. Tudo é buildado e roda direto num VPS **ARM64**.

**Este guia é o do stack.** O que é específico de um app — as variáveis dele, o que a imagem
dele contém, o que quebra só nele — mora no guia daquele app, e é para lá que você vai quando
o deploy é de um serviço só:

| Deploy | Guia |
|---|---|
| O sistema inteiro, ou o primeiro deploy de um host | este arquivo |
| Só a API (`pnpm prod:up api`) | [`apps/api/docs/guides/deploy.md`](../../apps/api/docs/guides/deploy.md) |
| Só o front (`pnpm prod:up web`) | [`apps/web/docs/guides/deploy.md`](../../apps/web/docs/guides/deploy.md) |

**Um stack, dois tempos de deploy.** `pnpm prod:up` sobe o sistema; `pnpm prod:up api` (ou
`web`) reconstrói e reinicia **só** aquele serviço, com o outro seguindo na imagem que já
tinha.

## Preparar o host

No servidor, Node 24 com corepack — os `prod:*` rodam via `pnpm`, e o corepack instala a versão
pinada no `packageManager` do `package.json` da raiz (nenhum Dockerfile escreve versão de pnpm;
ver [`adr/0006`](../adr/0006-one-source-for-node-pnpm-and-one-version-per-dependency.md)). O
VPS clona o **monorepo inteiro**, e é da raiz dele que se opera. O build de cada imagem usa a
raiz como contexto, que é onde estão o lockfile e o workspace (ver
[`apps/api/docs/adr/0156`](../../apps/api/docs/adr/0156-contexto-build-raiz-monorepo-runtime-podado-pnpm-deploy.md)):

```bash
corepack enable                            # uma vez por máquina
git clone <repo> && cd pet-oasis           # a RAIZ do monorepo; é daqui que se roda tudo
cp apps/api/.env.example apps/api/.env.production
cp apps/web/.env.example apps/web/.env.production
```

**Os dois arquivos precisam existir**, cada um dentro do app que é dono dele, e nenhum deles é
versionado — o Compose lê os dois como `env_file`, e um ausente derruba o `up`. O da API tem um
papel a mais, que é do stack e não dela: é o `--env-file` de **interpolação**, de onde saem
`POSTGRES_*` e `UPLOAD_HOST_DIR`. O que preencher em cada um está no guia do app
([API](../../apps/api/docs/guides/deploy.md#o-envproduction-da-api),
[web](../../apps/web/docs/guides/deploy.md#o-envproduction-do-web)).

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
([`adr/0007`](../adr/0007-single-compose-stack-one-image-per-app.md), e o desenho completo de
redes em [`apps/api/docs/adr/0148`](../../apps/api/docs/adr/0148-tres-redes-papeis-distintos-porta-api-despublicada.md)).

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

Estar na `frontend` dá acesso à API e **só**: Postgres e Redis ficam na `backend`, que é
`internal:` e não tem rota para lugar nenhum, e o web não entra nela. O contrato completo do
lado do cliente está em
[`integrating-with-the-api.md`](../../apps/api/docs/guides/integrating-with-the-api.md).

> ⚠️ **Nenhum serviço publica porta no host** — nem o banco, nem o cache, nem a API, nem o web.
> O nginx alcança os dois por DNS de container na rede `proxy`, e manutenção de banco é
> `docker exec`. No caso da API isso não é só higiene, e republicar a porta reabre um furo de
> segurança concreto: o porquê está no [guia dela](../../apps/api/docs/guides/deploy.md#o-proxy-host-da-api).

## Domínio e reverse proxy

A API atende em **`pet-oasis-api.maiahub.com.br`** e o front no apex,
**`pet-oasis.maiahub.com.br`**. O porquê dessa repartição — o nome da API de primeiro nível sob
`maiahub.com.br`, e não `api.pet-oasis.…`, e o apex sem nenhum redirect para a API — está em
[`apps/api/docs/adr/0160`](../../apps/api/docs/adr/0160-api-atende-num-subdominio-apex-fica-limpo.md).

O reverse proxy é o **Nginx Proxy Manager** (NPM), e a configuração dele **não vive neste
repositório** — é do servidor pessoal que hospeda a demo, pelo mesmo motivo registrado em
[`apps/api/docs/adr/0161`](../../apps/api/docs/adr/0161-reverse-proxy-upload-existe-nao-neste-repositorio.md).
O que segue é a **forma** que ela precisa ter; versionar uma cópia aqui só criaria duas verdades
divergindo em silêncio.

### O que cada proxy host precisa ter

São **dois** proxy hosts, um por app, com o mesmo desenho e destinos diferentes:

| Host | Destino |
|---|---|
| `pet-oasis.maiahub.com.br` (apex) | `http://pet-oasis-web:3001` |
| `pet-oasis-api.maiahub.com.br` | `http://pet-oasis-api:3000` |

1. **DNS.** Registro `A` de cada nome na Cloudflare, **proxiado** como os demais registros do
   domínio. O da API é de primeiro nível de propósito: o Universal SSL da Cloudflare cobre o
   apex e `*.maiahub.com.br`, e nada além — um nome de segundo nível não tem certificado na
   borda e falha no handshake TLS antes de a requisição chegar ao servidor.
2. **Certificado** Let's Encrypt emitido pelo NPM por **desafio DNS** na Cloudflare (token de
   API com permissão de editar a zona). É o desafio que funciona atrás do proxy da Cloudflare,
   onde a porta 80 do servidor não é o que o mundo vê.
3. **Destino por DNS de container**, na rede `proxy` (`docker network inspect proxy` tem que
   listar o container do NPM). É sempre o **nome do container** (`pet-oasis-api`,
   `pet-oasis-web`), nunca o alias `api`/`web` e nunca `127.0.0.1` — a porta não é publicada no
   host. O motivo de não usar o alias: a `proxy` é compartilhada com todo projeto
   que o NPM serve neste host, e `api` é o nome genérico que um segundo projeto mais
   provavelmente usaria; dois containers respondendo pelo mesmo nome viram round-robin no DNS
   do Docker, e o proxy alterna entre os dois sem erro nenhum. Por isso o compose de produção
   **não** declara alias na `proxy` (só nas redes exclusivas do projeto, onde ele é contrato
   entre API e web).
4. **Custom config** do proxy host (a aba *Advanced* do NPM, que entra no nível do `server`):

   ```nginx
   real_ip_header CF-Connecting-IP;
   real_ip_recursive off;
   ```

   É o que mantém verdadeira a cadeia de IP com a Cloudflare na frente: sem isto o
   `X-Forwarded-For` que chega à API termina na borda da Cloudflare, o `trust proxy` para nela,
   e todo visitante cai num balde só de rate limit. O NPM já confia nas faixas da Cloudflare
   (`set_real_ip_from`, em `ip_ranges.conf`); as duas linhas fazem o `$remote_addr` virar o
   visitante. Vale para **os dois** proxy hosts.

O que o NPM gera é o equivalente a este `location`, e é isto que qualquer outro reverse proxy
precisaria reproduzir — os quatro `proxy_set_header` são o contrato do `trust proxy`:

```nginx
location / {
    proxy_pass http://pet-oasis-api:3000;   # ou pet-oasis-web:3001, no host do apex
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## Subir

Sempre **da raiz do monorepo** — os `prod:*` são scripts da raiz:

```bash
pnpm prod:up          # o sistema inteiro: db, redis, api, web
pnpm prod:up api      # só a API: rebuild + restart dela; o web segue na imagem que já tinha
pnpm prod:up web      # só o front, idem
```

O deploy de um serviço só funciona nas duas direções porque o `web` **não** declara
`depends_on: api` (o porquê, e o modo de falha que isso evita, em
[`adr/0007`](../adr/0007-single-compose-stack-one-image-per-app.md)). Para conferir que o outro
serviço não foi tocado, compare o `StartedAt` antes e depois:

```bash
docker inspect -f '{{.State.StartedAt}} {{.Image}}' pet-oasis-api pet-oasis-web
```

> ⚠️ **As imagens têm que ser construídas no próprio servidor ARM.** É o que o `prod:up` faz (o
> Compose tem `build:`). Construir num x86 e enviar a imagem pronta quebra em runtime com
> "could not load the sharp module" — erro que não se parece nada com a causa, porque o
> `sharp` traz binário nativo por arquitetura.

`pnpm prod:down` derruba o stack; `pnpm prod:logs` acompanha os logs (dos dois serviços, ou de
um: `pnpm prod:logs api`). A migração do banco roda via `prisma migrate deploy` no entrypoint da
API e o seed é idempotente — a subida deixa o ambiente do zero funcionando.

## Verificar o stack

O que se confere aqui é o stack: os quatro containers de pé e saudáveis, e as redes como
devem estar.

```bash
docker ps --filter 'name=pet-oasis-' --format '{{.Names}}\t{{.Status}}'
#   pet-oasis-api    Up … (healthy)
#   pet-oasis-web    Up … (healthy)
#   pet-oasis-prod-db     Up … (healthy)
#   pet-oasis-prod-redis  Up … (healthy)

docker network inspect proxy -f '{{range .Containers}}{{.Name}} {{end}}'
#   tem que listar pet-oasis-api, pet-oasis-web e o container do NPM
```

Cada app responder pelo domínio dele, e as verificações que só fazem sentido nele — a imagem
do catálogo servida pela API, a cadeia de IP gravada em `audit_logs`, o front alcançando a API
por dentro — estão no guia do app: [API](../../apps/api/docs/guides/deploy.md#verificar-a-api),
[web](../../apps/web/docs/guides/deploy.md#verificar).

> Fora do escopo da app (infra do servidor): backup do volume `prod_pgdata`, firewall. O
> reverse proxy e o TLS também moram fora do repositório, mas a forma que precisam ter está
> escrita acima — é a peça sem a qual nada é alcançável pelo público.

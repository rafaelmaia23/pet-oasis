# Deploy do web em produção

**Pré-requisito: o stack existe.** O front é o serviço `web` do stack de produção do monorepo, e
o que vale para o stack inteiro — preparar o host, as redes, os proxy hosts, `prod:up`/`down`/
`logs`, o aviso de construir no próprio ARM — está em
[`docs/guides/deploy.md`](../../../../docs/guides/deploy.md) da raiz. Este guia é o que é **só
do web**.

Deploy só do front, da raiz do monorepo:

```bash
pnpm prod:up web    # rebuild + restart só dele; a API segue na imagem que já tinha
```

O container se chama **`pet-oasis-web`** e o serviço, `web`. O deploy de um serviço só funciona
nas duas direções porque o `web` **não** declara `depends_on: api`: se declarasse,
`up --build web` reconstruiria a API por arrasto. A outra metade dessa decisão é operacional —
o front sobe com a API fora e vice-versa; o que falha nesse caso é a chamada, não o `up`
([ADR-0004](../adr/0004-apex-for-frontend-api-on-subdomain.md) e
[`docs/adr/0007`](../../../../docs/adr/0007-single-compose-stack-one-image-per-app.md) da raiz).

## O `.env.production` do web

Mora em `apps/web/.env.production`, fora do git, copiado do `.env.example` ao lado:

```bash
cp apps/web/.env.example apps/web/.env.production
```

**Hoje ele é vazio de variáveis, e mesmo assim precisa existir** — o Compose o lê como
`env_file`, e um arquivo ausente derruba o `up` do serviço. Vazio não é descuido: o front não
tem banco nem segredo próprio ainda. O endereço interno da API e o segredo do cookie de sessão
nascem nas issues da Fase 12 que os introduzem, e cada uma acrescenta ao `.env.example` o que
usa.

Não há variável de rede aqui: as redes são do stack unificado da raiz — a que liga o web à API
nasce com ele, e a do nginx é declarada pelo nome literal `proxy`.

## O que a imagem contém

O runtime é o bundle **standalone** do Next, servido por `node server.js` como usuário
não-root: sem CLI do Next, sem pnpm, sem workspace e sem `node_modules` inteiro. O build
acontece dentro de um diretório materializado por `pnpm deploy`, **fora** do workspace — é o
que garante que a imagem não contenha a API por construção, e o que faz o standalone sair raso.
O porquê da ordem (`pnpm deploy` **antes** do `next build`, e sem `--prod`) está em
[`docs/adr/0007`](../../../../docs/adr/0007-single-compose-stack-one-image-per-app.md) da raiz.

O healthcheck usa o `fetch` global do próprio Node, porque a imagem slim não tem `curl` nem
`wget` — é ele que faz o `--wait` do `prod:up` esperar a **página**, e não só o processo.

## Rede e proxy host

O container escuta na **3001** dentro da rede e **não publica porta no host**: quem o alcança é
o nginx, por `http://pet-oasis-web:3001`, pela rede `proxy`. Publicar a porta abriria um caminho
que desvia do TLS e do rate limit da frente.

Ele entra em **duas** redes e não na `backend`: fala com a API por `http://api:3000`
(server-side, pela `frontend`) e é servido pelo nginx (pela `proxy`). Postgres e Redis ele não
alcança — a `backend` é `internal:`.

O proxy host do front é o **apex**, `pet-oasis.maiahub.com.br`, e a forma que ele precisa ter
(DNS proxiado na Cloudflare, certificado por desafio DNS, destino por nome de container, o
`real_ip_header` da aba *Advanced*) é a mesma da API e está no
[guia do stack](../../../../docs/guides/deploy.md#o-que-cada-proxy-host-precisa-ter). O apex
fica **limpo**: nenhum caminho da API é redirecionado a partir dele.

## Verificar

```bash
# O apex respondendo, com TLS válido
curl -sS -o /dev/null -w '%{http_code} %{ssl_verify_result}\n' \
  https://pet-oasis.maiahub.com.br/                       # 200 0

# O container saudável (o healthcheck bate na própria página)
docker inspect -f '{{.State.Health.Status}}' pet-oasis-web    # healthy

# O front alcançando a API por dentro, pelo nome do serviço
docker exec pet-oasis-web node -e \
  "fetch('http://api:3000/api/v1/status').then(r=>console.log(r.status))"   # 200
```

Se o último falhar com `ENOTFOUND api`, o container não está na rede `frontend` — o que
acontece quando o serviço subiu fora do stack, não quando a API está fora do ar.

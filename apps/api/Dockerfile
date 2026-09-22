# syntax=docker/dockerfile:1

# O contexto de build é a RAIZ DO MONOREPO, não este diretório: o lockfile e o
# pnpm-workspace.yaml vivem lá, e o pnpm só instala um projeto de dentro do
# workspace dele. Todo COPY abaixo é relativo à raiz (apps/api/...), e o
# .dockerignore que vale é o `Dockerfile.dockerignore` ao lado deste arquivo
# (por Dockerfile, e não na raiz: cada app exclui o que não é seu).
#
# A imagem base segue o `engines.node` do package.json da raiz: o pnpm recusa
# instalar quando o Node da máquina não casa com o range declarado, então
# máquina, CI e imagem correm a mesma major por construção, não por disciplina.
#
# O pnpm vem pelo corepack, que já está na imagem: `corepack enable` põe o shim
# no PATH e a primeira chamada a `pnpm` lê o campo `packageManager` do
# package.json da raiz, baixa exatamente aquela versão e confere o hash. Não há
# versão do pnpm escrita aqui — a fonte é uma, e é o package.json.
#
# Quatro estágios. `base` é o preparo comum; dele herdam `build` (`FROM base`) e
# `dev` (`FROM base`). O `runtime` NÃO herda de ninguém daqui: parte da imagem do
# Node e pega do `build` só o que copia (`COPY --from=build`) — o porquê está no
# cabeçalho do `base`. O que `build` e `dev` fazem A MAIS que o `base` é tudo que
# os separa, e por isso cada um deles cabe em poucas linhas.

# ─── base ─────────────────────────────────────────────────────────────────────
# O preparo que `build` e `dev` compartilham, escrito UMA vez: OpenSSL, corepack,
# os manifestos do workspace, o install filtrado pela API e o fonte. Antes esse
# bloco existia em duplicata nos dois estágios, e a diferença real entre eles —
# `generate`+`bundle`+`deploy` de um lado, entrypoint de watch do outro — ficava
# soterrada sob trinta linhas idênticas.
#
# O `runtime` NÃO herda daqui, de propósito: ele é o oposto deste estágio. Aqui
# há workspace, pnpm, devDependencies e fonte em /workspace; lá há só o bundle e
# as dependências de produção, rasos em /app e sob um usuário não-root. Herdar
# carregaria o /workspace inteiro para dentro da imagem que vai para o servidor,
# que é exatamente o que o `pnpm deploy` do estágio `build` existe para evitar.
# O único pedaço que o `runtime` repete é a instalação do OpenSSL, e por um
# motivo que não é o deste estágio — está explicado lá.
FROM node:24-bookworm-slim AS base
WORKDIR /workspace
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# OpenSSL antes do `pnpm install`: é no install que o @prisma/engines escolhe
# qual build do schema-engine baixar, detectando a versão do libssl. A
# bookworm-slim não traz nem o binário `openssl` nem o libssl (o Node linka o
# seu estaticamente), então a detecção falha e o Prisma cai no default
# silencioso `debian-openssl-1.1.x` — que hoje roda, mas é a engine errada
# escolhida por acidente, e o acidente muda de resultado em ARM64 ou num bump
# da imagem base.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable
# A ordem das três camadas abaixo — manifestos, install, fonte — é o que faz
# mexer em `src/` não refazer o install: a camada do install só invalida quando
# um manifesto ou o lockfile muda. Mantê-la é requisito, não estilo; inverter
# (copiar o fonte antes do install) custaria um install inteiro a cada edição.
# pnpm-workspace.yaml carrega o `allowBuilds` (bcrypt, prisma, esbuild…): sem
# ele o pnpm bloqueia os scripts de build e o bcrypt chega sem binário.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Os manifestos de TODO projeto do workspace (`apps/*`, `packages/*`): o
# lockfile os lista como importers, e o install é do workspace que o lockfile
# descreve. O pnpm 12 não recusa o install sem eles (cria os symlinks
# pendurados e segue), mas um install que só funciona por tolerância é acidente
# esperando bump. `--parents` mantém o caminho de cada um; um app ou pacote
# novo não muda esta linha. Do outro app entra SÓ o manifesto (o resto está no
# Dockerfile.dockerignore): o `--filter api...` abaixo deixa as dependências
# dele fora do install — Next, React e Tailwind não têm o que fazer aqui.
COPY --parents apps/*/package.json packages/*/package.json ./
# Sem `--mount=type=cache` na store do pnpm, e isso é uma escolha, não esquecimento.
# O cache mount aceleraria o install quando ele é refeito sem que as dependências
# mudem — mas a camada do install só é refeita QUANDO elas mudam (é o que a ordem
# acima garante), então o caso que ele cobre é raro por construção. Em troca, a
# store passaria a viver num filesystem diferente do node_modules e o pnpm
# perderia o hardlink, caindo para cópia de árvore inteira; e o cache mount é
# local ao builder — o CI (que não builda imagem, ver .github/workflows/ci.yml) e
# um clone novo não o veem. Revisitar se um dia o install voltar a ser o gargalo
# de um build cujo lockfile não mudou.
RUN pnpm install --frozen-lockfile --filter api...
# Os pacotes internos inteiros, junto do fonte: o tsconfig.json da API estende
# o preset de `packages/tsconfig` (lido pelo `prisma generate` e pelo tsup), o
# fonte da API importa `packages/api-contracts` (consumido do fonte TS, sem
# build — o tsup o inlina no bundle), e é para o diretório deles que os
# symlinks do install apontam.
COPY packages packages
COPY apps/api/prisma apps/api/prisma
COPY apps/api/src apps/api/src
COPY apps/api/tsconfig.json apps/api/tsup.config.ts apps/api/prisma.config.ts apps/api/

# ─── build ────────────────────────────────────────────────────────────────────
# O que o `base` já deixou pronto (um `pnpm install` só do workspace) → generate
# do client Prisma → bundle com o tsup → `pnpm deploy` das dependências de
# produção da API para /deploy. Um install (e não dois em paralelo) mantém o pico
# de memória baixo o bastante para VPS pequena — é o `base` que o garante agora.
FROM base AS build
# prisma.config.ts resolves env("DATABASE_URL") at load time; `generate` does not
# connect, so a build-only placeholder is enough (never carried into runtime).
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN pnpm --filter api run db:generate
RUN pnpm --filter api run build
# Production-only node_modules of the API alone. Under a workspace,
# apps/api/node_modules is a tree of symlinks into the ROOT node_modules/.pnpm
# (shared by every project), so copying it whole would drag the workspace along
# or break the links. `pnpm deploy` materializes the API's own dependency
# tree, self-contained, in /deploy/node_modules — reusing the install above.
RUN pnpm --filter api deploy --prod /deploy

# ─── runtime ──────────────────────────────────────────────────────────────────
# Slim, non-root image, flat layout: no workspace here, just the API at /app —
# so `WORKDIR /app`, the uploads mount and the `docker exec pet-oasis-api node
# dist/...` calls from the host's systemd units are unchanged. The entrypoint
# applies migrations and seeds before start. No pnpm here: the entrypoint calls
# node_modules/.bin directly and the server is a plain `node dist/server.js`.
#
# Parte da imagem do Node, e não do `base`: ver o porquê no cabeçalho daquele
# estágio.
FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# O mesmo OpenSSL do estágio `base`, pelo outro lado da mesma detecção: o
# entrypoint roda `prisma migrate deploy` a cada boot, e o CLI redetecta o
# libssl ali. Sem isto, a detecção falha de novo e o log de inicialização abre
# com dois blocos de warning; com isto, o que o boot detecta é o mesmo que o
# build baixou. Precisa vir antes do `USER node` (apt exige root).
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
# The deployed node_modules is self-contained (its own .pnpm/ inside, relative
# symlinks), so copying the directory whole keeps every link valid.
COPY --from=build /deploy/node_modules ./node_modules
COPY --from=build /workspace/apps/api/dist ./dist
# prisma migrate deploy needs the schema + migrations + config; the prisma CLI is
# a production dependency (already in node_modules).
COPY --from=build /workspace/apps/api/prisma ./prisma
COPY apps/api/package.json apps/api/prisma.config.ts ./
COPY apps/api/infra/docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh
USER node
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]

# ─── dev ──────────────────────────────────────────────────────────────────────
# O `base` sem nada por cima além do entrypoint: o install filtrado pela API que
# ele já fez (`--filter api...`, com as devDeps), sem bundle e sem deploy. Roda
# `tsx watch` contra um src/ bind-montado. Sem `USER node` aqui: o container
# *começa* como root para o entrypoint gerar o client Prisma dentro do volume
# anônimo src/generated (que é root), e só então cair para o uid/gid do host
# (HOST_UID/HOST_GID, via `setpriv`) antes de qualquer escrita em bind mount —
# senão os arquivos que o seed deixa em uploads/ pertencem a root no host
# (10.16). O client Prisma é gerado no start do container, nesse volume anônimo
# (ver infra/docker-compose.dev.yml + infra/docker-entrypoint.dev.sh), não
# assado aqui.
#
# O `COPY apps/api/src` herdado do `base` fica mascarado pelo bind mount do
# Compose — mas precisa existir mesmo assim: é o que faz `docker run` desta
# imagem sem o Compose ter um fonte para o watcher. Já `packages/` NÃO tem bind
# mount em dev: mudança em `packages/*` pede rebuild da imagem (`pnpm run dev`
# já builda). São arquivos de config e o contrato, mudam raramente; quando
# mudarem com frequência, o mount é a resposta.
FROM base AS dev
COPY apps/api/infra/docker-entrypoint.dev.sh apps/api/
RUN chmod +x apps/api/docker-entrypoint.dev.sh
# O layout dentro da imagem espelha o do repo — e é por isso que o caminho
# abaixo aparece TAMBÉM nos bind mounts de `infra/docker-compose.dev.yml`, que
# precisam apontar para cá. A repetição é deliberada (issue 14): este caminho não
# é um botão que se possa girar, é `/workspace` + o lugar do app no repo, e os
# destinos dos COPY do `base` soletram o mesmo layout literalmente — uma variável
# compartilhada parametrizaria só este WORKDIR e deixaria o resto literal, que é
# fonte única de mentira. Quem mudar um lado muda o outro: os dois arquivos se
# nomeiam mutuamente, e a divergência aparece como `pnpm run dev` deixando de
# recarregar a quente.
WORKDIR /workspace/apps/api
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.dev.sh"]

# O Dockerfile da API tem um estágio `base`, e o `runtime` fica fora dele (11.14)

`build` e `dev` repetiam, linha por linha, o mesmo preparo: instalar o OpenSSL antes do
install (com o mesmo parágrafo de comentário duas vezes), `corepack enable`, copiar os
manifestos do workspace, `pnpm install --frozen-lockfile --filter api...` e copiar `packages/`
e o fonte da API. Trinta linhas idênticas de cada lado, e a diferença real entre os dois
estágios — `db:generate` + `build` + `pnpm deploy` num, o entrypoint de watch no outro —
soterrada no meio delas. Pior que a duplicação em si era o que ela custava a cada mudança: a
issue 11.3 precisou acrescentar duas linhas (`COPY --parents packages/*/package.json` e
`COPY packages packages`) e teve de acrescentá-las **duas vezes**, em sincronia. Esse preparo
agora vive uma vez, num estágio `base`; `build` e `dev` partem dele (`FROM base AS …`) e ficam
só com o que é seu, cada um em poucas linhas — o contraste entre os dois virou legível.

O **`runtime` não herda do `base`**, e isso é deliberado: ele é o oposto do que o `base` é.
No `base` há workspace, pnpm, `devDependencies` e fonte em `/workspace`; no `runtime` há só o
bundle e as dependências de produção, rasos em `/app` e sob usuário não-root. Herdar levaria o
`/workspace` inteiro para dentro da imagem que vai ao servidor — exatamente o que o
`pnpm --filter api deploy --prod /deploy` existe para evitar ([ADR-0156](0156-contexto-build-raiz-monorepo-runtime-podado-pnpm-deploy.md)).
O único pedaço que o `runtime` repete é a instalação do OpenSSL, e por um motivo que não é o do
`base`: lá é o `@prisma/engines` escolhendo qual schema-engine baixar durante o install, aqui é
o CLI redetectando o libssl no `migrate deploy` de cada boot ([ADR-0158](0158-openssl-vai-tres-estagios-imagem-engine-prisma-detectada.md)).
Duas instalações, duas razões — não é duplicação a eliminar.

Três decisões menores ficaram registradas no próprio Dockerfile, e valem aqui pelo porquê:

- **A ordem manifestos → install → fonte é requisito, não estilo.** É ela que faz uma edição em
  `src/` não refazer o install. A refatoração tinha de preservá-la e preservou: com o fonte
  alterado, a camada do `pnpm install` sai `CACHED` e só o `COPY apps/api/src` reexecuta.
- **Sem `--mount=type=cache` na store do pnpm**, recusado com motivo. Ele aceleraria o install
  refeito sem mudança de dependência, mas a ordem acima já garante que a camada do install só
  é refeita quando as dependências mudam — o caso coberto é raro por construção. Em troca, a
  store passaria a viver num filesystem diferente do `node_modules` e o pnpm perderia o
  hardlink, caindo para cópia; e o cache mount é local ao builder, invisível para um clone novo
  e para o CI, que nem builda imagem ([`ci.yml`](../../../../.github/workflows/ci.yml)).
- **O caminho da API dentro da imagem de dev (`/workspace/apps/api`) continua escrito nos dois
  lugares** — o `WORKDIR` do estágio `dev` e os bind mounts de
  [`infra/docker-compose.dev.yml`](../../../../infra/docker-compose.dev.yml) —, e a repetição é
  deliberada. Compartilhar o valor exigiria interpolar uma variável no Compose e recebê-la como
  `ARG`; a fonte teria de ser um env file versionado, passado como segundo `--env-file` nos oito
  scripts de `dev*` e `prod:*`, porque os que o Compose já lê (`apps/api/.env.*`) não são
  versionados. E ainda assim seria fonte única de mentira: o `COPY --parents` e os destinos dos
  demais `COPY` do `base` soletram o mesmo layout literalmente e não aceitam a variável, de modo
  que ela cobriria só o `WORKDIR` final. O caminho não é um botão configurável — é `/workspace`
  mais o lugar do app no repo. Os dois arquivos passam a se nomear mutuamente em comentário,
  porque a divergência não estoura: o mount cria o diretório errado, o watcher segue lendo o
  fonte assado na imagem e o hot reload apenas para de funcionar.

A prova de que nada mudou de comportamento é mais forte que a da issue 11.2: os três alvos
buildam e as imagens `runtime` e `dev` saem com os **digests de camada idênticos** aos de antes
da refatoração (`RootFS.Layers` byte a byte), mesmo `WorkingDir`, `User`, `Entrypoint`, `Env` e
`ExposedPorts`, e o mesmo `node_modules` de topo só com dependências de produção. `pnpm run dev`
sobe e responde 200 com os quatro mounts pousando em `/workspace/apps/api/…`; `pnpm prod:up`
sobe e a API responde 200 pela rede `frontend`, rasa em `/app` como uid 1000.

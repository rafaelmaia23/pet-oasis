# 14: Estágio base comum no Dockerfile da API

**What to build:** o Dockerfile da API deixa de repetir, em `build` e em `dev`, o mesmo bloco
de preparação (OpenSSL, corepack, manifestos do workspace, install, cópia do fonte): esse bloco
vive **uma vez**, num estágio base que os dois estendem, e o que cada estágio faz a mais fica
visível por contraste. Junto, o caminho da API dentro da imagem de dev (hoje escrito no
Dockerfile e repetido nos bind mounts do Compose de dev) passa a ter uma fonte só — ou a
repetição fica justificada por escrito. Levantado na revisão de padrões da issue 02 (Duplicated
Code + Shotgun Surgery, ambos "judgement call"); nada disto muda comportamento.

**Blocked by:** 03 — fechada: o install no Dockerfile ficou como vai ficar (manifestos dos
`packages/*` por `COPY --parents` antes do `pnpm install`, `COPY packages packages` depois, junto
do fonte, nos dois estágios; o `injectWorkspacePackages` do `deploy` **não** foi necessário no
pnpm 12 — ver `apps/api/docs/adr/README.md#infraestrutura`). O bloco duplicado que esta issue concentra
cresceu duas linhas.

**Status:** fechada em 2026-09-22

O que de fato ficou pronto — onde divergiu do plano, o porquê está ao lado:

- [x] O estágio `base` concentra o que `build` e `dev` compartilhavam: OpenSSL antes do install
      (com o comentário do porquê, agora uma vez só), `corepack enable`, os manifestos do
      workspace (raiz, `apps/*` e `packages/*`) e `pnpm install --frozen-lockfile --filter api...`
      — **mais a cópia do fonte** (`packages`, `prisma`, `src` e os configs da API), que a "What
      to build" já listava como parte do bloco duplicado e que os dois estágios faziam
      identicamente. `build` (`FROM base`) ficou com `DATABASE_URL` de placeholder +
      `db:generate` + `build` + `deploy`; `dev` (`FROM base`) ficou com o entrypoint, o `WORKDIR`
      e o `ENTRYPOINT`. O `runtime` continua raso, sem workspace, partindo da imagem do Node.
- [x] **O caminho da API na imagem de dev fica repetido, de propósito** — decisão do dono entre
      as duas opções, tomada com o custo real da alternativa na mesa. Investigar a fonte única
      mudou o trade-off: o Compose só compartilha caminho com o Dockerfile por variável
      interpolada + `build.args`/`ARG`; os env files que ele já lê (`apps/api/.env.*`) **não são
      versionados**, e um default (`${VAR:-/workspace/apps/api}`) devolve o literal ao YAML *e*
      ao `ARG` — dois literais, não um. A fonte única de verdade exigiria um env file versionado
      como segundo `--env-file` nos oito scripts `dev*`/`prod:*`, e ainda assim cobriria só o
      `WORKDIR` final, porque o `COPY --parents` e os destinos dos demais `COPY` do `base`
      soletram o mesmo layout literalmente. Ficou a repetição, com o motivo em comentário nos
      **dois** arquivos, cada um nomeando o outro — a divergência não estoura, ela faz o hot
      reload parar em silêncio, e é isso que o comentário avisa.
- [x] Melhorias gerais avaliadas, cada uma registrada no próprio Dockerfile:
      **cache mount da store do pnpm — recusado**, porque a ordem das camadas já faz o install só
      ser refeito quando as dependências mudam (o caso que o mount cobriria é raro por
      construção), ele quebraria o hardlink da store para o `node_modules` (filesystems
      diferentes → cópia) e é local ao builder — invisível para um clone novo e para o CI, que
      nem builda imagem; **ordem das camadas — mantida e provada**: com o fonte alterado, a
      camada do `pnpm install` sai `CACHED` e só o `COPY apps/api/src` reexecuta.
- [x] Nenhuma mudança de comportamento, com prova mais forte que a da issue 02: os três alvos
      buildam e as imagens `runtime` e `dev` saem com **digests de camada idênticos** aos de antes
      da refatoração (`RootFS.Layers` byte a byte), mesmo `WorkingDir`/`User`/`Entrypoint`/`Env`/
      `ExposedPorts` e o mesmo `node_modules` de topo (28 módulos, só dependências de produção,
      uid 1000, raso em `/app`). `pnpm run dev` sobe e responde 200 em `/api/v1/status`, com os
      quatro mounts pousando em `/workspace/apps/api/…` e o cwd do container lá; `pnpm prod:up`
      sobe os quatro serviços saudáveis e a API responde 200 pela rede `frontend` (verificado com
      `UPLOAD_HOST_DIR` descartável, como na 02). Suíte (1367) + `typecheck` + `lint` +
      `docs:check` verdes.
- [x] A decisão ficou em ADR, no lugar que a issue 07 fixou (`apps/api/docs/adr/`, tema
      Infraestrutura › Imagem e boot de produção): `0201-dockerfile-api-estagio-base-runtime-fora-dele.md`,
      com por que o `base` existe, por que o `runtime` fica fora dele (herdar levaria o
      `/workspace` inteiro para a imagem do servidor — o oposto do que o `pnpm deploy` faz) e por
      que as duas instalações de OpenSSL não são duplicação (razões diferentes: o install do
      `@prisma/engines` de um lado, o `migrate deploy` de cada boot do outro). Linha
      correspondente acrescentada ao índice. O `code-review` pegou o vizinho que essa mudança
      contradizia: o [ADR-0158](../../../apps/api/docs/adr/0158-openssl-vai-tres-estagios-imagem-engine-prisma-detectada.md)
      descrevia **três** instalações de OpenSSL e o `dev` "entrando logo depois" com a sua. A
      decisão dele não mudou (os três estágios que precisam continuam com ele; detectar e não
      pinar segue valendo), só o mecanismo — então foi **reescrito narrando a revisão**, como
      manda o `CLAUDE.md`, e o índice ganhou o "(revisto na 11.14)" no padrão que o 0148 já usava.
      O `docs:check` prova caminho e âncora, não afirmação: quem pega contradição assim é a
      revisão.

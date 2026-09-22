# Um stack Compose para o sistema, e uma imagem por app construída da raiz

> Decisão de sistema, tomada no kickoff da issue 11 da Fase 11 (2026-09-21) e registrada no
> fecho (issue 13). Vale para os três ambientes. Até aqui o racional vivia só em comentário de
> `infra/docker-compose*.yml` e dos dois Dockerfiles, e em
> `.scratch/fase-11-monorepo/issues/11-import-web.md`.

Antes do monorepo havia **dois stacks** que fingiam não se conhecer: o Compose da API criava
uma rede, e o Compose do web a declarava como externa e torcia para ela existir — um `down` na
API derrubava o `up` do front com "network not found", e o sintoma não dizia qual dos dois
repositórios estava errado. Com os dois apps no mesmo repo, isso vira um arranjo de arquivos.

**Decidimos um stack só, em `infra/` da raiz**: um `docker-compose.yml` base mais um override
por ambiente (`dev`, `test`, `prod`), projeto `pet-oasis-{dev,test,prod}`. Subir tudo ou subir
um serviço passa a ser **escolha de argumento, não de arquivo** — `pnpm prod:up` sobe o
sistema, `pnpm prod:up api` (ou `web`) reconstrói e reinicia só aquele serviço, com o outro
rodando a imagem que já tinha. Monorepo não é monólito: a API anda à frente do front, e o
deploy de um não pode derrubar o outro. Isso foi **provado à mão nas duas direções** (o
`StartedAt` e a imagem do outro container ficam intactos).

Quatro consequências decidiram a forma do arquivo, e cada uma existe contra um modo de falha
concreto:

- **A rede entre API e web deixa de ser externa.** É a consequência direta de o stack ser um
  só, e quem a narra — com o incidente que a motivou e a reversão da `pet-oasis` da 10.17 — é
  a [`0148`](../../apps/api/docs/adr/0148-tres-redes-papeis-distintos-porta-api-despublicada.md)
  da API, que é dona do desenho de redes desde a Fase 10. Aqui só fica a regra de sistema: rede
  que liga serviços **do mesmo stack** é do stack; `external:` é para o que liga stacks
  diferentes, e sobrou só a `proxy` do nginx.
- **O `web` é declarado inteiro no override de produção, não na base.** Serviço declarado na
  base sobe em **todo** ambiente, e o web só existe como container em produção: em dev ele roda
  no host (`pnpm --filter web dev`, HMR nativo na 3001) e em teste não existe. Quando um
  segundo ambiente precisar dele em container, o esqueleto sobe para a base.
- **O web não tem `depends_on: api`.** Dois motivos, e o segundo é o que custa dinheiro: um
  sobe com o outro fora (o que falha nesse caso é a chamada, não o `up`), e `up --build web`
  construiria também as dependências declaradas — o deploy só do web reconstruiria a API por
  arrasto, desfazendo a razão de o stack ser argumentável.
- **Cada app mantém o seu `.env.<ambiente>`**, e o da API é também o `--env-file` de
  interpolação do Compose (é dele que saem `POSTGRES_*` e `UPLOAD_HOST_DIR`). O do web precisa
  **existir**, mesmo vazio: é a garantia de que quem faz o deploy leu o `.env.example` dele.
  Os caminhos relativos dos arquivos Compose resolvem contra `infra/`, o diretório do primeiro
  `-f` — e não contra a raiz nem contra o app que chamou —, e é por isso que `env_file` e bind
  mount começam por `../apps/<app>/`.

**Quem invoca o stack depende do ambiente.** Os `prod:*` são scripts da **raiz**, porque o
stack de produção é do sistema; `dev*` e `test:services:*` ficam em `apps/api` apontando para
`../../infra`, porque em dev e em teste o stack é o **dela** — o web roda no host, e a suíte
sobe só Postgres e Redis. O critério é "de quem é o que sobe", não "onde está o arquivo".

**Uma imagem por app, construída da raiz do monorepo.** O contexto na raiz e o
`Dockerfile.dockerignore` por app já eram a forma da API desde a issue 02, e o porquê é dela
([`0156`](../../apps/api/docs/adr/0156-contexto-build-raiz-monorepo-runtime-podado-pnpm-deploy.md)).
O que o segundo app acrescentou, e é decisão de sistema, é **como um app não vê o outro**: o
install é filtrado (`--filter api...`, `--filter web...`) e cada `Dockerfile.dockerignore`
exclui `apps/*` menos o próprio app e menos os manifestos (`!apps/*/package.json`), que entram
por um glob só (`COPY --parents apps/*/package.json packages/*/package.json`) porque o lockfile
os lista como importers. **Um app novo não muda nenhuma dessas linhas** — é o critério que a
revisão da issue 11 fixou, e é o que separa este arranjo de um `COPY` por app. O resultado foi
inspecionado nos dois targets: nenhum `next`/`react` na imagem da API, nenhum Prisma na do web.

**No web, `pnpm deploy` vem antes do `next build`, e sem `--prod`.** A ordem é a decisão: o
deploy existe para o build acontecer **fora do workspace**, onde o `next build` não enxerga a
API nem o lockfile da raiz — e é por isso que o standalone sai raso (`server.js` na raiz do
deploy), com o runtime idêntico ao de antes do monorepo. `--prod` aqui estaria errado porque o
build precisa das devDependencies; o recorte de produção do web é o **standalone do Next**, e é
só ele que o estágio de runtime copia. Na API é o oposto e continua valendo o que a
[`0156`](../../apps/api/docs/adr/0156-contexto-build-raiz-monorepo-runtime-podado-pnpm-deploy.md)
registra: lá o `pnpm deploy --prod` é que produz o recorte.

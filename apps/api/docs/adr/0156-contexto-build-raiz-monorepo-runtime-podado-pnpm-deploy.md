# O contexto de build é a raiz do monorepo, e o runtime é podado por `pnpm deploy` (11.2)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Infraestrutura** › *Imagem e boot de produção*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Desde que a API vive em `apps/api` de um workspace pnpm, o `Dockerfile` dela não pode mais
ser buildado com o contexto no próprio diretório: o `pnpm-lock.yaml` e o `pnpm-workspace.yaml`
moram na raiz do monorepo, e o pnpm só instala um projeto de dentro do workspace dele. Então
o Compose aponta `context:` para a raiz (`../../..` a partir de `infra/`) e nomeia o
`dockerfile: apps/api/Dockerfile`; todo `COPY` é relativo à raiz. O ignore que vale é o
**`Dockerfile.dockerignore`** ao lado do Dockerfile, não um `.dockerignore` da raiz — um
único ignore da raiz serviria a todo app, e o que a API exclui (o outro app) é o que o outro
app precisa. O Docker lê o `<Dockerfile>.dockerignore` quando ele existe e só então cai no da
raiz.

O estágio `runtime` continua **raso** em `/app` (sem workspace), e isso é o que preserva
`WORKDIR /app`, o mount de `/app/uploads` e os `docker exec pet-oasis-api node dist/…` das
units do systemd sem mudança. O que muda é como o `node_modules` de produção chega lá: sob um
workspace, `apps/api/node_modules` é uma árvore de symlinks para a virtual store da
**raiz** (`node_modules/.pnpm`, compartilhada por todo projeto), então copiá-lo inteiro
arrastaria o workspace ou quebraria os links, e o `pnpm prune --prod` da Fase 11.1 podaria a
store de todos. **`pnpm --filter api deploy --prod /deploy`** materializa a árvore só da API,
autocontida (a própria `.pnpm/` dentro, symlinks relativos), reaproveitando o install do build;
o `runtime` copia `/deploy/node_modules` e mais nada do deploy — `dist/`, `prisma/`,
`package.json` e `prisma.config.ts` continuam copiados explicitamente, como antes.

O estágio `dev` espelha o layout do repo (`/workspace/apps/api`) porque o `tsx watch` precisa
do `node_modules` do workspace; por isso os bind mounts do Compose de dev apontam para esses
caminhos, e o entrypoint faz o `chown` de `uploads` relativo ao cwd em vez de `/app/uploads`.

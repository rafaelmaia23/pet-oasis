# 01: pnpm no pacote único

**What to build:** a API, ainda como pacote único na raiz do repo, instala, testa, faz
typecheck, lint, build e constrói as três stages do Dockerfile **com pnpm** — e o npm deixa de
existir no projeto. É a primeira camada da migração, isolada de propósito: a estritez do pnpm
(nenhum import de dependência não declarada) aparece aqui, com a suíte inteira verde como
oráculo, e não misturada ao move de diretório da issue seguinte.

**Blocked by:** None (can start immediately).

**Status:** fechada em 2026-09-18

O que de fato ficou pronto — onde divergiu do plano, o porquê está ao lado:

- [x] `pnpm` é pinado pelo campo `packageManager` do `package.json` (corepack) e a versão do
      Node por `engines` (`24`, a do host; a imagem Docker subiu de `node:22` para `node:24`
      para casar — o pnpm recusa `install` quando o Node não satisfaz `engines`). O `.npmrc`
      **não sobreviveu**: pnpm 12 lê configuração de `pnpm-workspace.yaml`, não de `.npmrc`,
      então os timeouts de fetch foram para lá e o `.npmrc` foi apagado.
- [x] O `package-lock.json` sumiu; o `pnpm-lock.yaml` é versionado (gerado com `pnpm import`,
      então nenhuma versão resolvida mudou); `pnpm install --frozen-lockfile` reproduz o
      ambiente.
- [x] O `allowScripts` do npm virou `allowBuilds` em `pnpm-workspace.yaml`: bcrypt, prisma,
      `@prisma/engines`, esbuild e **`vue-demi`** (postinstall trazido pelo
      `@scalar/api-reference`). **`sharp` não entra**: 0.35 não tem script de install — a lista
      da spec estava errada nesse item. Provado por um `docker build --no-cache` sem aviso de
      script bloqueado e pelo `bcrypt`/`sharp` carregando na suíte e na imagem podada.
- [x] Dependências fantasma expostas e **declaradas**: `@types/ms` (importado direto) e
      `@types/express-serve-static-core` (o `declaration: true` precisa nomear o tipo inferido de
      `app` e dos routers). Sem hoisting. Efeito colateral da estritez: o caminho real do bundle
      do Scalar passa por `node_modules/.pnpm/…`, e o `sendFile` recusa segmento com ponto —
      a rota agora passa o diretório do pacote como `root` e só o arquivo relativo é validado.
- [x] Scripts do `package.json` chamam `pnpm run`; `npx` virou `pnpm exec`.
- [x] As três stages do Dockerfile instalam via corepack (`corepack enable` + o `packageManager`
      do `package.json`; nenhuma versão de pnpm escrita no Dockerfile); `runtime` fica só com
      dependências de produção (`pnpm prune --prod`) e roda como `USER node`; OpenSSL antes do
      install preservado nas três.
- [x] Entrypoints de dev e prod funcionam sem mudança de código (já chamavam
      `node_modules/.bin/*` direto); só os comentários mudaram.
- [x] Suíte completa (1292) + `typecheck` + `lint` + `docs:check` verdes; `docker build` dos
      três targets verde; `pnpm run dev` sobe e responde 200; `prod:up` sobe e responde 200
      (verificado localmente com rede `pet-oasis` e `UPLOAD_HOST_DIR` descartáveis).
- [x] README, guias de dev e deploy, `CLAUDE.md`, ADRs, `docs/context/`, Compose e
      entrypoints não dizem mais `npm`; os guias ganharam o pré-requisito `corepack enable`.
      Ficam `npm` só em narrativa histórica (`docs/context/history.md`, itens riscados do
      `backlog.md`, issues de fases fechadas).

# 11: Import do `pet-oasis-web` com histórico

**What to build:** o front vive em `apps/web`, com o histórico dele já reescrito para esse
caminho, sobre os presets compartilhados, com uma versão só de cada dependência comum, dentro
do stack Compose unificado, e com toda referência ao repo irmão desfeita. O `.scratch` aberto
dele vira a Fase 12 no `todo.md` da raiz. Pré-condição: o web está congelado num ponto verde
(tudo commitado, branch limpa).

**Blocked by:** 06, 07, 10.

**Status:** fechada em 2026-09-21

- [x] Numa cópia do repo do web, `git filter-repo --to-subdirectory-filter apps/web`; o
      resultado é mergeado no monorepo com `--allow-unrelated-histories`. `git log --follow`
      de um arquivo do web atravessa o import; nenhum commit do web é perdido. **Os 14 commits
      entraram, com a mensagem reescrita no mesmo passo** (decisão do dono, no kickoff): os 9
      commits reais ganharam o escopo `web` (`docs:` → `docs(web):`), e os 5 merges no estilo
      `merge: …` viraram a forma padrão do Git (`Merge branch '<nome>' into main`, com o nome
      real da branch recuperado do reflog do repo de origem e a linha original preservada no
      corpo). Sem isso o job `commitlint` do CI reprovaria o PR da fase — o `--from FLOOR` dele
      alcança a segunda raiz do histórico. Cada mensagem foi lintada com o `commitlint` do
      monorepo antes do merge. O `.git-blame-ignore-revs` não muda: o histórico do web foi
      reescrito, não movido.
- [x] `catalog:` no `pnpm-workspace.yaml` fixa uma versão para TypeScript, Biome, `@types/node`,
      Zod e o que mais aparecer em mais de um pacote; API e web usam `catalog:`. A API sobe
      para a versão mais nova onde não houver breaking grande. **Fato verificado:** Next 16.3.4
      aceita TS 6 — não declara `typescript` como peer, e `next typegen`, `tsc --noEmit` e
      `next build` passaram com 6.0.x; a API **não desce**. Duas exceções à regra "mais nova",
      com o motivo no próprio `pnpm-workspace.yaml`: TS fica no 6 (o 7 já existe e é a
      reescrita nativa — breaking grande) e `@types/node` fica no **24**, casando com
      `engines.node` (a API estava em 25: tipo acima do runtime compila código que quebra em
      produção — decisão do dono). Biome sobe para 2.5, Zod, tsx e Vitest entram no catalog
      por aparecerem em mais de um pacote. O `pnpm update -r @types/react` fechou o único aviso
      de peer que o import trouxe.
- [x] O web estende o preset Next do `@pet-oasis/tsconfig` e a base do `biome-config`; o que
      sobra no `tsconfig`/`biome.json` dele é só o que é dele (`paths`, `include`; domínios
      `next`/`react`, parser de Tailwind, ignore de `.next`). O preset usa `jsx: preserve` e o
      web usava `react-jsx`; o Next aceita os dois e não reescreveu o arquivo.
- [x] Toda referência a `../pet-oasis-api/...` no web vira caminho dentro do monorepo, e o
      `docs:check` da raiz passa a cobrir o web (`.tsx` e `.mjs` entraram nas extensões
      varridas; `.next` nos diretórios ignorados). O `npm run <x>` da documentação viva do web
      (design system, comentários de `src/`) virou `pnpm run <x>`; o das issues já fechadas
      ficou como histórico.
- [x] O `CLAUDE.md` do web encolhe para o específico da stack (Next, BFF, design system) e
      perde o fluxo de branch próprio — o fluxo é o da raiz. O `CONTEXT.md` dele fica e o
      `CONTEXT-MAP.md` já o aponta; os ADRs dele mantêm a numeração e ganharam o índice
      `apps/web/docs/adr/README.md` (o desenho da raiz pede um por app). O `docs/agents/` do
      web saiu — descrevia um repo single-context, e a config das skills é a da raiz.
- [x] O Compose do web deixa de existir sozinho: os serviços `api`, `web`, `db`, `redis`,
      `mailpit` vivem num **stack único** em `infra/` da raiz (base + overrides
      `dev`/`test`/`prod`), projeto `pet-oasis-{dev,test,prod}`. A rede API↔web pertence ao
      stack (`frontend`; a `pet-oasis` externa da 10.17 foi revertida, narrado no ADR 0148 da
      API e no ADR-0004 do web); a rede `proxy` do nginx continua externa. `prod:up` sobe tudo;
      `prod:up api` (ou `web`) reconstrói só um serviço, o outro continua rodando — **provado
      manualmente nas duas direções** (`StartedAt` e imagem do outro container inalterados;
      o web sem `depends_on: api`, senão `up --build web` reconstruiria a API por arrasto).
      Decisões do dono no kickoff: o web **não** tem serviço em dev (roda no host, HMR nativo —
      por isso o `web` é declarado inteiro no override de produção, e não na base, onde subiria
      em todo ambiente); cada app mantém o seu `.env.<env>` (o da API segue como `--env-file` de
      interpolação); `prod:*` migram para a raiz, `dev*`/`test:services:*` ficam na API
      apontando para `../../infra`.
- [x] O Dockerfile do web usa o contexto da raiz e `pnpm deploy --filter web`; a imagem não
      contém a API. O `next build` roda **dentro** do diretório do deploy, fora do workspace,
      e por isso o standalone sai raso (`server.js` na raiz) — o runtime é o mesmo de antes. O
      install é `--filter web...` (a API fica fora), e o Dockerfile da API ganhou o simétrico
      (`--filter api...`). Os manifestos de todo projeto entram por um glob só
      (`COPY --parents apps/*/package.json packages/*/package.json`), porque o lockfile os
      lista como importers, e cada `Dockerfile.dockerignore` exclui `apps/*` menos o próprio
      app e os manifestos — um app novo não muda nenhuma dessas linhas (revisão da issue). Três targets buildados
      e inspecionados: nenhum `next`/`react` na imagem da API, nenhum Prisma na do web.
- [x] A pasta `.scratch/foundation-and-auth-spine` do web migra para o `.scratch/` da raiz
      (renomeada para `fase-12-web-auth-spine/` na issue 15); o
      `todo.md` da raiz ganha a **Fase 12** (espinha de autenticação do web) na forma aberta,
      apontando para ela; a spec e as issues do web não mudam de conteúdo — a única edição foi
      de caminho: cinco menções ao design system do web, que de fora do app só resolvem com o
      prefixo, `apps/web/docs/design-system.md` (o `docs:check` as reprovou depois do move).
- [x] `turbo run typecheck lint build` cobre o web (`build` ganhou `.next/**` menos o cache
      como output); o CI passa a rodar o web quando afetado — o `--affected` já é por pacote,
      nada a mudar no workflow.
- [x] Suíte da API + typecheck/lint de tudo + `docs:check` verdes; Docker `build` dos dois apps
      verde; stack de dev sobe os dois (`pnpm dev` na raiz: Compose da API + `next dev` no host,
      200 nos dois em 25 s).

**Fora desta issue, com dono:** o guia de deploy da API ainda descreve o stack antigo
(`docker network create pet-oasis`, `prod:up` de dentro de `apps/api`) — a reescrita é da
issue 13, que já a lista. A pasta local `pet-oasis-api` é renomeada para `pet-oasis` no fecho
desta issue (pedido do dono); o rename no GitHub é ato da issue 13 — o remote local já
aponta para `rafaelmaia23/pet-oasis`.

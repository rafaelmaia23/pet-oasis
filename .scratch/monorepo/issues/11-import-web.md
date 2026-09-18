# 11: Import do `pet-oasis-web` com histórico

**What to build:** o front vive em `apps/web`, com o histórico dele já reescrito para esse
caminho, sobre os presets compartilhados, com uma versão só de cada dependência comum, dentro
do stack Compose unificado, e com toda referência ao repo irmão desfeita. O `.scratch` aberto
dele vira a Fase 12 no `todo.md` da raiz. Pré-condição: o web está congelado num ponto verde
(tudo commitado, branch limpa).

**Blocked by:** 06, 07, 10.

**Status:** ready-for-agent

- [ ] Numa cópia do repo do web, `git filter-repo --to-subdirectory-filter apps/web`; o
      resultado é mergeado no monorepo com `--allow-unrelated-histories`. `git log --follow`
      de um arquivo do web atravessa o import; nenhum commit do web é perdido.
- [ ] `catalog:` no `pnpm-workspace.yaml` fixa uma versão para TypeScript, Biome, `@types/node`,
      Zod e o que mais aparecer em mais de um pacote; API e web usam `catalog:`. A API sobe
      para a versão mais nova onde não houver breaking grande. **Fato a verificar primeiro:**
      Next 16 aceita TS 6? Se não, a API desce e o motivo fica registrado.
- [ ] O web estende o preset Next do `@pet-oasis/tsconfig` e a base do `biome-config`; o que
      sobra no `tsconfig`/`biome.json` dele é só o que é dele.
- [ ] Toda referência a `../pet-oasis-api/...` no web vira caminho dentro do monorepo (`../api/...`
      relativo, ou a partir da raiz), e o `docs:check` da raiz passa a cobrir o web.
- [ ] O `CLAUDE.md` do web encolhe para o específico da stack (Next, BFF, design system) e
      perde o fluxo de branch próprio — o fluxo é o da raiz. O `CONTEXT.md` dele fica e o
      `CONTEXT-MAP.md` já o aponta; os ADRs dele mantêm a numeração (já eram numerados).
- [ ] O Compose do web deixa de existir sozinho: os serviços `api`, `web`, `db`, `redis`,
      `mailpit` vivem num **stack único** em `infra/` da raiz (base + overrides
      `dev`/`test`/`prod`), projeto `pet-oasis-{dev,test,prod}`. A rede API↔web pertence ao
      stack; a rede `proxy` do nginx continua externa. `prod:up` sobe tudo; `prod:up api` (ou
      `web`) reconstrói só um serviço, o outro continua rodando — provado manualmente.
- [ ] O Dockerfile do web usa o contexto da raiz e `pnpm deploy --filter web`; a imagem não
      contém a API.
- [ ] A pasta `.scratch/foundation-and-auth-spine` do web migra para o `.scratch/` da raiz; o
      `todo.md` da raiz ganha a **Fase 12** (espinha de autenticação do web) na forma aberta,
      apontando para ela; a spec e as issues do web não mudam de conteúdo.
- [ ] `turbo run typecheck lint build` cobre o web; o CI passa a rodar o web quando afetado.
- [ ] Suíte da API + typecheck/lint de tudo + `docs:check` verdes; Docker `build` dos dois apps
      verde; stack de dev sobe os dois.

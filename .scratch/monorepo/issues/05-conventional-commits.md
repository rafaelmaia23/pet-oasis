# 05: Conventional Commits com husky + commitlint

**What to build:** um commit fora da convenção é recusado na máquina de quem commita.
Mensagens seguem `tipo(escopo): descrição` em inglês, com o escopo **obrigatório** e restrito
ao enum do monorepo; a mensagem de merge passa a ser a padrão do Git, que o commitlint ignora.

**Blocked by:** 02.

**Status:** fechada em 2026-09-18

O que de fato ficou pronto — onde divergiu do plano, o porquê está ao lado:

- [x] `husky` (9.1.7), `@commitlint/cli` e `@commitlint/config-conventional` (21.2.2) como
      devDependencies da raiz, com caret como o resto (o `turbo` é a exceção pinada, por motivo
      próprio). `prepare: husky` no `package.json` da raiz: o `pnpm install` grava
      `core.hooksPath = .husky/_` e gera os shims; só `.husky/commit-msg` (`pnpm exec commitlint
      --edit "$1"`) é versionado. Sem `.git` — o `pnpm install` do Dockerfile — o husky imprime
      `.git can't be found` e **sai com 0**, lido no fonte dele: a imagem não muda, o log de
      build ganha uma linha. Worktree novo só tem o hook depois de `pnpm install` nele.
- [x] `commitlint.config.mjs` na raiz (o `.mjs` porque a raiz não é `type: module`; o Biome
      da raiz formata o arquivo) estende `config-conventional` e acrescenta só `scope-empty:
      never` e `scope-enum` com exatamente `api`, `web`, `contracts`, `tsconfig`, `biome-config`,
      `infra`, `ci`, `repo`. Multi-escopo com vírgula passa sem regra extra: o `scope-enum` já
      separa por `,`, `/` e `\` e confere cada pedaço — provado com `feat(api,contracts): …` e
      `feat(api, contracts): …`.
- [x] `Merge branch '…' into …` passa (ignore padrão do commitlint); `merge: fase 11, issue 05 —
      …` falha no enum de tipos, provado — o estilo está abandonado, e o `git merge --no-ff`
      sem `-m` é o caminho. O `CLAUDE.md` diz isso no passo de merge da issue.
- [x] Verificado com mensagens de teste: `feat(api): …` passa; `feat: …` (scope-empty),
      `feat(cart): …` (scope-enum) e `Feat(api): …` (type-case + type-enum) falham. E de ponta
      a ponta: um `git commit -m "Feat(repo): …"` real foi recusado pelo hook (`husky -
      commit-msg script failed (code 1)`), e o mesmo commit em `build(repo): …` entrou. Rodar o
      commitlint sobre `dev..HEAD` mostrou o que do hábito antigo não passaria: os `merge: …`,
      os escopos fora do enum (`pnpm`, `fase-11`), um `chore:` sem escopo e **dois subjects
      começando com maiúscula** (`Turborepo as …`, `Dockerfile via …`) — o `subject-case` do
      preset recusa `sentence-case`, que para ele é só "primeira letra maiúscula". Essa é a
      regra que mais vai pegar e está explicada no `CLAUDE.md`. O histórico não é reescrito.
- [x] `CLAUDE.md` da API (que a raiz importa até a 07): a regra de commits virou "Conventional
      Commits em inglês, escopo obrigatório, NUNCA assinados" — tipos, enum, minúscula inicial,
      merge com mensagem padrão, hook por `pnpm install`, nada de trailer de agente. README da
      raiz ganhou a seção "Commits"; o porquê em `apps/api/docs/adr/0196-conventional-commits-escopo-obrigatorio-recusados-hook.md`
      (nasceu no contexto temático de arquitetura e virou ADR no merge com a 07), indexado. O `CLAUDE.md` da raiz ainda é o provisório que importa o da API — a 07 escreve o
      definitivo e leva a convenção junto.
- [x] Achado lateral: o `biome check` do repo inteiro (11.4) só resolve o `extends:
      "@pet-oasis/biome-config/biome"` da API quando o **cwd** é `apps/api`
      (`node_modules/.bin/biome check ../..`); da raiz, o nome do pacote não resolve, porque a
      raiz não o tem em `node_modules`. O 11.4 foi reescrito com essa ressalva. Rodado de lá:
      937 arquivos, e os únicos erros vêm de `.claude/worktrees/…` (worktrees locais com Prisma
      gerado, fora do git) — o repo está limpo; excluir `.claude` no `biome.json` da raiz está
      no `docs/reference/backlog.md`, com o contexto.
- [x] Revisão (duas frentes, padrões e spec): todos os ACs reverificados empiricamente pelo
      revisor; correções aplicadas — `docs/todo.md` com o progresso, o CI citado como futuro
      (issue 06) e não como fato, e a saída das crases no `subject-case` (o commitlint remove
      o trecho entre crases antes de conferir, então `` …: `Turborepo` as … `` passa)
      documentada no `CLAUDE.md` e no 11.5. Ficou para o dono: o 11.5 entrou em
      `docs/context/` seguindo a 04, embora a spec revista diga que o `docs/context/` deixa de
      receber decisão nova "a partir da 07" — se a leitura for "a partir de já", o 11.5 vira ADR
      na 07 junto com o resto.

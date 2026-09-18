# 05: Conventional Commits com husky + commitlint

**What to build:** um commit fora da convenção é recusado na máquina de quem commita.
Mensagens seguem `tipo(escopo): descrição` em inglês, com o escopo **obrigatório** e restrito
ao enum do monorepo; a mensagem de merge passa a ser a padrão do Git, que o commitlint ignora.

**Blocked by:** 02.

**Status:** ready-for-agent

- [ ] `husky` e `@commitlint/cli` + `@commitlint/config-conventional` como dependências de dev
      da raiz; o hook `commit-msg` roda o commitlint; `pnpm install` instala o hook (script
      `prepare`), sem passo manual.
- [ ] A configuração estende `config-conventional` e acrescenta: `scope-empty: never`,
      `scope-enum` com exatamente `api`, `web`, `contracts`, `tsconfig`, `biome-config`, `infra`,
      `ci`, `repo`; multi-escopo com vírgula aceito.
- [ ] Mensagens que começam com `Merge` continuam ignoradas (comportamento padrão do
      commitlint); o estilo `merge: …` usado até a Fase 10 é abandonado — a partir daqui,
      `git merge --no-ff` usa a mensagem padrão do Git.
- [ ] Um commit `feat(api): …` passa; `feat: …` (sem escopo), `feat(cart): …` (escopo fora do
      enum) e `Feat(api): …` falham — verificado manualmente com `--dry-run`/mensagens de teste.
- [ ] O `CLAUDE.md` (e, quando existir, o da raiz) diz a convenção: inglês, tipo+escopo
      obrigatórios, o enum, nada de trailer de agente, merge com mensagem padrão.

# Conventional Commits com escopo obrigatório, recusados no hook (11.5)

> Decisão da Fase 11 (issue 05), registrada em 2026-09-18. Nasceu no antigo contexto temático da
> API (**Arquitetura**) no mesmo dia em que ele foi migrado para ADRs, e por isso entrou aqui já
> como ADR, no fim da numeração. A regra acionável está no `CLAUDE.md` da raiz.

Até a Fase 10 a mensagem de commit era "inglês, sem convenção" — o tipo (`feat`, `docs`,
`build`) já vinha por hábito, o escopo às vezes (`build(pnpm)`, `docs(fase-11)`), e o merge tinha
um estilo próprio, `merge: fase 11, issue 04 — …`. Num repo de um app isso lê bem; num monorepo,
"o que mudou e **onde**" é a pergunta que o log precisa responder sem abrir o diff, e hábito não
sobrevive a três apps. A Fase 11 fecha a convenção como **Conventional Commits** (`tipo(escopo):
descrição`, em inglês) com o **escopo obrigatório e restrito a um enum** — os pacotes do
workspace (`api`, `web`, `contracts`, `tsconfig`, `biome-config`) mais os dois transversais
(`infra`, `ci`) e a própria raiz (`repo`: workspace, Turbo, hooks). Multi-escopo com vírgula,
`feat(api,contracts): …`, para o commit que atravessa dois. App novo entra no enum quando existir;
`build(pnpm)` e `docs(fase-11)`, do início da fase, não passariam hoje — o escopo diz *onde*, não
*com o quê* nem *quando*.

A régua é **husky + commitlint** na raiz: `@commitlint/config-conventional` traz tipo em
minúsculas, enum de tipos, header e linhas do corpo em até 100 colunas, subject sem ponto final;
`commitlint.config.mjs` acrescenta só `scope-empty: never` e o `scope-enum`. O hook
`commit-msg` roda `commitlint --edit` sobre a mensagem **antes** de o commit existir, e é
instalado pelo `prepare` do `package.json` da raiz — `pnpm install` basta, sem passo manual. O
que o `prepare` faz é gravar `core.hooksPath = .husky/_` no `.git/config` e gerar os shims em
`.husky/_/` (ignorados pelo próprio husky); só `.husky/commit-msg` é versionado. Duas
consequências disso: no build Docker, onde não há `.git`, o husky imprime `.git can't be found`
e sai com 0 — a imagem não muda e o log de build ganha uma linha; e um **worktree novo não tem
o hook** até rodar `pnpm install` nele (o `.husky/_/` não vem no checkout), o que é uma das
razões de o CI (issue 06, ainda por vir) ter de lintar os commits do PR também — o hook local
é a primeira barreira, não a única.

Três coisas do preset que não são óbvias e foram medidas antes de escrever a regra. **(1)** O
`subject-case` recusa `sentence-case`, e para o commitlint isso é só "primeira letra
maiúscula": `build(repo): Turborepo as the pipeline` falha, `build(repo): turbo.jsonc, and a
Biome config …` passa — a descrição começa em minúscula mesmo quando a primeira palavra é nome
próprio ou arquivo, e maiúscula no meio é livre — ou a primeira palavra vai entre crases, que
o `ensureCase` remove antes de conferir (`` build(repo): `Turborepo` as … `` passa). Foi a regra que mais pegou o histórico da
própria fase (dois commits das issues 01–04). **(2)** O `scope-enum` já separa o escopo por
`,`, `/` e `\` e confere cada pedaço — o multi-escopo vem de graça, sem regra extra. **(3)** O
commitlint ignora por padrão mensagem que começa com `Merge …` (a que o `git merge --no-ff`
escreve sozinho), e é por isso que o estilo `merge: …` foi abandonado, não trocado: ele teria
de passar pelo enum de tipos, e um tipo `merge` seria inventar vocabulário para dizer o que a
mensagem padrão do Git já diz (`Merge branch 'feat/…' into fase-11`). A partir daqui o merge é
`git merge --no-ff <branch>`, sem `-m`.

O histórico anterior não é reescrito: a régua vale do commit em que entrou em diante, e o
`--from`/`--to` que o CI roda (11.6) cobre só os commits do PR.

# O CI verifica só o afetado, com os services do job no lugar do Compose (11.6)

> Decisão da Fase 11 (issue 06), registrada em 2026-09-19. Nasceu no antigo contexto temático da
> API (**Arquitetura**) enquanto ele era migrado para ADRs (issue 07), e por isso entrou aqui já
> como ADR, no fim da numeração. O workflow é `.github/workflows/ci.yml`; a regra acionável (PR
> com CI verde antes de mergear fase na `dev` e `dev` na `main`) está no `CLAUDE.md` da raiz.
> Contexto de execução em `.scratch/monorepo/issues/06-ci-verification.md`.

Até aqui "verde" era um fato da máquina de quem mergeava: `pnpm test`, `typecheck` e `lint`
rodavam no host e ninguém mais via o resultado. O `.github/workflows/ci.yml` põe esse verde
fora da máquina — em todo PR e em todo push em `dev`/`main` — e o `CLAUDE.md` passa a exigir
o CI do PR verde antes de mergear fase na `dev` e `dev` na `main`. É só verificação: deploy
automático e remote cache do Turbo continuam sendo esforços próprios, não efeitos colaterais
de um workflow.

O job `verify` é um `turbo run typecheck lint test --affected`, seguido de um `pnpm docs:check`
à parte: o Turbo compara a base (`TURBO_SCM_BASE`) com o HEAD e roda as tasks só dos pacotes
com arquivo mudado; o `docs:check` é script da raiz, não task do Turbo (issue 07 — a
documentação de um app cita a do outro, e o recorte por pacote esconderia isso), e por isso
roda inteiro em todo job, fora do afetado. A base é
a branch-alvo no PR (`origin/<base_ref>`, com `fetch-depth: 0` para ela existir no clone) e o
commit anterior no push (`event.before`). Três coisas foram medidas antes de escrever o
workflow. **(1)** O afetado é por **pacote**, e `inputs` de task não entram no cálculo — um
`inputs: ["!docs/**"]` no `test` não impede que mudar `apps/api/docs/` rode a suíte da API.
Logo "PR só de docs não roda a suíte" vale para docs da **raiz** (README, `.github/`, o
`CLAUDE.md` da raiz), que não são de pacote nenhum, e não para `apps/api/docs/`. Filtrar por
caminho no próprio workflow (`paths-ignore`) resolveria isso ao custo de pular o job inteiro,
`docs:check` incluído — justamente o que um PR de docs precisa —, então a limitação ficou. **(2)** Base
que não existe no clone tem dois desfechos no Turbo: SHA desconhecido (branch recém-criada,
onde `before` é zero; force-push) vira `WARNING unable to detect git range` e "tudo mudou";
ref por **nome** desconhecida (`origin/xyz`) aborta com erro de git. O workflow não depende
de nenhum dos dois: confere a base com `git cat-file -e` e, sem ela, roda sem `--affected`.
O nome da branch-alvo entra no step por `env:`, não interpolado no `run:` — é entrada que
quem abre o PR controla. **(3)** O modo estrito de env do Turbo deixa passar `CI` e
`GITHUB_ACTIONS` (variáveis de vendor de CI) sem `passThroughEnv`, e uma variável própria
(`FOO`) não — é o que permite ao `test` da API ler `CI` sem tocar o `turbo.jsonc`.

O `test` da API sobe Postgres e Redis via Compose e derruba ao final; no CI os dois já estão de
pé como `services` do job (a mesma `postgres:16-alpine` do Compose — o contrib dela traz
`unaccent` e `pg_trgm`, que a migration da busca cria com `CREATE EXTENSION` — e `redis:7-alpine`,
publicados em 5433/6380 como no host). Das duas saídas que a issue admitia — o script pular o
Compose ou o CI chamar o `vitest` por fora —, ficou a primeira: com `CI=true` (que o GitHub
exporta) o script faz `exec vitest run` e nada mais; chamar o Vitest por fora do Turbo perderia
o filtro do afetado, que é o ponto do job. Provado por negativo: com os serviços derrubados,
`CI=true pnpm run test` falha em `P1001: Can't reach database server` sem subir container
nenhum.

O `.env.test` do runner nasce do `.env.example` (`cp` + `sed` no workflow), nunca de arquivo
commitado nem de secret: o que muda é o banco e o Redis de teste, `LOG_LEVEL=debug` (a suíte de
logging exige, e em teste o logger só escreve no ring buffer) e `JWT_SECRET`/`PEPPER`, gerados
com `openssl rand` na hora — não são segredos, vivem só naquele runner. Dois achados dessa
derivação, medidos rodando a suíte inteira com o arquivo gerado: o template traz `SENTRY_DSN=`
vazio, e `env.ts` valida a variável como `z.url().optional()`, que recusa string vazia — a app
não sobe com uma cópia fiel do `.env.example` (o workflow apaga a linha; a correção de fundo
está no [backlog](../../../../docs/reference/backlog.md#envexample-com-sentry_dsn-vazio-não-passa-no-envts--p)); e os tetos de rate limit do
template (15 min de janela, contra 60 s no `.env.test` local) passam na suíte porque os testes
leem `env.RATE_LIMIT_*` em vez de fixar o número. O client do Prisma é gerado no runner
(`db:generate` com `DATABASE_URL` placeholder, como no Dockerfile) porque `src/generated/` não é
versionado e o typecheck precisa dele.

O job `commitlint` roda só em PR, instala só as dependências da raiz (`pnpm install
--filter=pet-oasis`: 76 pacotes em vez de 760) e lê `--from <base.sha> --to <head.sha>` — só os
commits do PR, merges ignorados pelo padrão do commitlint. Com um **piso**: o primeiro PR real
(`fase-11 → main`) ficou vermelho em 137 commits, dos quais só 7 eram posteriores à régua — a
Fase 10 inteira e as issues 01–04 vieram antes dela, com `merge: …`, `build(pnpm)`, `chore:`
sem escopo e os trailers que a regra depois proibiu. A frase do 11.5, "a régua vale do commit
em que entrou em diante", precisava existir no workflow e não só no texto: `FLOOR` é o SHA do
commit que trouxe a convenção, e quando ele está no PR mas não na base, o `--from` sobe até
ele; quando a base já o contém — todo PR depois do primeiro merge em `dev` e `main` —, o piso
não muda nada. Reescrever a história foi descartado de novo pelos mesmos motivos (branches
publicadas, o SHA do commit de move no `.git-blame-ignore-revs`). Node vem de `engines.node` e pnpm de
`packageManager`, os dois do `package.json` da raiz; não há versão escrita no workflow. O
Dockerfile fixa a mesma major em `FROM node:24` por disciplina, não por leitura — é o
`engines` que faz o pnpm recusar um Node fora da faixa, nos três lugares.

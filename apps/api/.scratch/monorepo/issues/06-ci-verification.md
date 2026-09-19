# 06: CI de verificação

**What to build:** todo push em branch e todo PR para `dev` ou `main` roda no GitHub Actions
`typecheck`, `lint` e `test` **do que foi afetado**, com Postgres e Redis de teste como
services, e o commitlint sobre os commits do PR. `main` e `dev` passam a ter um "verde"
verificável fora da máquina de quem mergeia. **Sem** deploy automático e **sem** remote cache.

**Blocked by:** 04, 05.

**Status:** fechada em 2026-09-18 — com uma prova que só o dono pode fazer (o PR de teste,
abaixo)

O que de fato ficou pronto — onde divergiu do plano, o porquê está ao lado:

- [x] `.github/workflows/ci.yml`, disparado por `pull_request` (qualquer PR — a spec fala em
      "PR para `dev` ou `main`", que é onde o fluxo os abre; não restringir custa nada e cobre
      um PR de issue para a branch de fase) e por `push` em `dev`/`main`. Node vem de
      `engines.node` (`actions/setup-node` com `node-version-file: package.json`) e pnpm de
      `packageManager` (`pnpm/action-setup@v4` sem versão) — nenhuma versão escrita no
      workflow; cache do store do pnpm pelo `setup-node`. `concurrency` cancela o run anterior
      do mesmo PR a cada push; em `dev`/`main` nada é cancelado.
- [x] `turbo run typecheck lint docs:check test --affected` com `TURBO_SCM_BASE` na base do PR
      (`origin/<base_ref>`, com `fetch-depth: 0`) ou no `event.before` do push. É o mesmo que o
      `--filter=...[<base>]` da issue, na forma que o Turbo 2 documenta. **`docs:check` entrou**
      além do trio da issue: é uma task de verificação do pipeline, custa segundos e é o que
      um PR de docs precisa. **Divergência medida:** o afetado do Turbo é por **pacote** e
      `inputs` de task não entram no cálculo (provado com `inputs: ["!docs/**"]` no `test`:
      `apps/api/docs/todo.md` mudado → `@pet-oasis/api#test` continua na lista). Logo "PR só de
      docs não roda a suíte" vale para docs da raiz (README, `.github/`, `CLAUDE.md` da raiz —
      `turbo ls --affected` devolve "no packages") e **não** para `apps/api/docs/`, que roda a
      API inteira. `paths-ignore` no workflow pularia o `docs:check` junto; ficou a limitação,
      documentada no workflow e no 11.6. Segundo achado (corrigido na revisão): base inexistente
      tem dois desfechos no Turbo — SHA desconhecido (`before` zero em branch nova; force-push)
      vira warning e "tudo mudou"; ref por nome desconhecida aborta com erro de git —, então o
      workflow não depende de nenhum: confere a base com `git cat-file -e` e, sem ela, roda sem
      `--affected`. O `base_ref` entra por `env:`, não interpolado no shell (achado da revisão).
- [x] `postgres:16-alpine` (a do Compose; o contrib traz `unaccent` e `pg_trgm`) e
      `redis:7-alpine` como `services` do job, publicados em 5433/6380 com as credenciais do
      `.env.test`. O `.env.test` do runner nasce do `.env.example` por `cp` + `sed`: banco e
      Redis de teste, `LOG_LEVEL=debug` (a suíte de logging exige; descoberto com um vermelho
      na primeira simulação) e `JWT_SECRET`/`PEPPER` por `openssl rand` na hora — não são
      segredos, nada em `secrets`. E a linha `SENTRY_DSN=` vazia é apagada: `z.url().optional()`
      recusa string vazia e a app não sobe com a cópia fiel do template (descoberto na
      simulação; correção de fundo no `docs/reference/backlog.md`). O client do Prisma é gerado
      no runner com `DATABASE_URL` placeholder, como no Dockerfile.
- [x] O `test` da API, vendo `CI=true` (que o GitHub exporta e que o modo estrito do Turbo
      deixa passar por ser variável de vendor — medido: `CI` e `GITHUB_ACTIONS` passam, `FOO`
      não), faz `exec vitest run` e não toca o Compose; fora do CI o script é o de sempre. Foi
      a primeira das duas saídas da issue: chamar o `vitest` por fora do Turbo perderia o filtro
      do afetado. A decisão está comentada no workflow. Provado por negativo: com os serviços
      derrubados, `CI=true pnpm run test` morre em `P1001` sem subir container. Simulação do
      job inteiro no host (env gerado como no workflow, services de pé, mesmo comando Turbo com
      `TURBO_SCM_BASE=fase-11`): 6 tasks verdes, 1292/1292. Um dos runs intermediários teve 60
      falhas que não se reproduziram em três runs cheios seguidos (dois via Turbo, um direto) —
      não explicado; no CI, Postgres e Redis nascem zerados a cada run.
- [x] Revisão (duas frentes, padrões e spec): o revisor de spec mediu de novo o afetado por
      pacote e o comportamento com base inexistente — a narrativa "aborta" valia só para ref
      por nome, corrigida no workflow, no 11.6 e aqui; "Node da mesma fonte que o Dockerfile"
      era coincidência de major, não leitura, reescrito. Da revisão de padrões: `base_ref` por
      `env:`; o aviso do dotenv-cli sobre `.env.development` ausente comentado no workflow; a
      pendência dos required status checks virou item do backlog. Ficou para o dono decidir
      (levantado pelos revisores, não decidido): `docs:check` no `turbo run` e `pull_request`
      sem restrição de alvo são acréscimos à letra da issue; e a terceira saída para "PR só de
      docs da API" — um step que detecta diff restrito a `apps/api/docs/**` e omite `test` do
      `turbo run` — não foi adotada por ser lógica de caminho fora do Turbo.
- [x] Job `commitlint`, só em PR: `pnpm install --frozen-lockfile --ignore-scripts
      --filter=pet-oasis` (76 pacotes, só a raiz — medido numa cópia isolada; sem o filtro o
      `pnpm exec` puxa os 760 do workspace) e `commitlint --from <base.sha> --to <head.sha>
      --verbose`. `HUSKY=0` no workflow inteiro: ninguém commita no runner.
- [ ] **Fica para o dono** (não há `gh` nesta máquina e o push é ação externa): fazer o push
      da branch, abrir um PR de teste com um commit fora da convenção (ex.: `Feat(api): x`) ou
      uma suíte vermelha, ver o PR ficar vermelho, e fechá-lo. Depois, o badge do README da
      raiz só aparece quando o workflow tiver rodado ao menos uma vez em `main`. Proteger
      `dev`/`main` com "required status checks" (`verify (affected)` e `commitlint (PR
      commits)`) é o passo seguinte natural — está no `docs/reference/backlog.md`, com o
      contexto, porque é configuração do GitHub, não do repo.
- [x] README da raiz: badge e seção "CI". README da API: CI na "Disciplina de processo".
      `CLAUDE.md` da API (que a raiz importa até a 07): fase → `dev` e `dev` → `main` só por PR
      com CI verde; o commitlint do CI deixou de ser "ainda por construir"; `pnpm test` com
      `CI=true`. Porquê em `docs/context/architecture.md` (11.6), indexado; backlog com o
      `SENTRY_DSN` e os dois itens que citavam a issue 06 como futuro reescritos.

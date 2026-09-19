# Arquitetura — camadas, roteamento e onde vive o quê

> O fluxo rígido (route → controller → service → repository) está no `CLAUDE.md`. Aqui ficam as
> decisões de encaixe: os pontos em que a regra foi testada e o que se decidiu quando ela
> conflitou com outra.

---

## Roteamento

### `authenticate` saiu do `app.ts` (global) e foi para o grupo de rota

Rotas públicas de autenticação (`/auth/login`, `/auth/signup`, `/auth/refresh`) não podem depender
de já estar autenticado — em especial `/auth/refresh`, cujo propósito é recuperar acesso quando o
access token expirou. Com `authenticate` global, um Bearer expirado nesse header derrubava a
requisição com 401 antes de chegar na rota, mesmo sem `canAccess`.

A correção aplica `authenticate` só nos grupos protegidos (`/me`, `/users`, `/users/:userId`,
`/features`, `/roles`), deixando `/status` e `/auth` de fora — **de propósito, não por omissão**.
`logout`, `GET /auth/sessions` e `DELETE /auth/sessions/:id` são protegidos mas vivem dentro do
`/auth` público, então cada uma aplica `authenticate` + `canAccess` diretamente na própria
definição de rota (`auth.routes.ts`), não no grupo inteiro.

### `optionalAuthenticate` — o terceiro modo, para a vitrine pública (9.6)

`authenticate` é tudo-ou-nada: ele já tolerava a **ausência** de header (segue sem `req.user`, e quem
dá o 401 é o `canAccess` depois), mas token malformado ou expirado ainda virava 401. A vitrine
pública decidida na 9.1/N15 não pode fazer isso — `GET /brands` atende o visitante que chegou pelo
Google e o funcionário logado, e um token velho no header do navegador não pode transformar a
listagem de marcas em erro.

`optionalAuthenticate` (mesmo arquivo, `authenticate.middleware.ts`) resolve o ator quando dá e
**segue anônimo quando não dá**, nunca lançando. Os dois modos dividem uma única função de resolução
token→ator: o que muda entre eles é exclusivamente o que se faz com a falha. Duplicar seria duplicar
`verifyAccessToken` + `computeEffectiveFeatures` + `setActorId`, e é justamente `setActorId` que faz o
visitante identificado aparecer no access log e no audit.

Consequência para quem escreve rota: **rota montada com `optionalAuthenticate` lê `req.user` direto,
nunca via `getAuthUser`** — o helper lança 401 quando ele falta, que é o oposto do contrato aqui. A
escrita no mesmo router continua protegida de graça, porque `canAccess` já responde 401 sozinho sem
`req.user`. Montado em `/brands`, `/categories` e `/tags` (9.6); `/products` (9.8) usa o mesmo
middleware, ali para escolher a view pela capability do viewer.

---

## Onde cada coisa vive

### A gravação transacional do audit vive no repository; o service passa o descritor

A política exige que a linha de audit de uma ação que muda estado entre na **mesma** `$transaction`
da mutação; a regra de camadas diz que só o repo toca o Prisma, e é lá que a transação vive.
Conciliar os dois: o service decide a semântica (action/targetType/targetId/metadata — decisão de
negócio) e passa um `AuditDescriptor` ao método de escrita do repo, que roda mutação +
`record(descriptor, tx)` numa transação interativa. A alternativa (service abrir
`prisma.$transaction` e passar `tx` ao repo) daria call sites mais idiomáticos, mas furaria "só o
repo toca o Prisma" — preterida.

### `record` é lib de observabilidade, não repository

Ela pode escrever no Prisma de qualquer camada (o login falho grava direto do service), pelo mesmo
enquadramento do `logger`/`AsyncLocalStorage`: observabilidade, não dado de negócio. Com `tx`
propaga o erro (rollback); sem `tx` engole e loga.

### `src/lib/` não conhece módulo nenhum

Quando os três guards de escalação viraram `assertActorIsAdmin`, o helper passou a receber o ator
**já buscado** em vez de buscá-lo. Buscar dentro dele eliminaria mais uma linha por chamador, mas
obrigaria `src/lib/` a importar `userRepository` — `lib` é a camada transversal, e furar isso por
uma linha sairia mais caro que a duplicação restante.

### `src/scripts/` é código; `infra/` é agendamento

`src/scripts/` importa Prisma/`env`/`logger` e é bundlado pelo tsup. `infra/` guarda o agendamento
(systemd timer, preferido a cron por dar `journalctl`, `Persistent=` e proteção contra sobreposição).

### SQL cru vive exclusivamente no repository

Via `$queryRaw` com template parametrizado — nunca concatenação, nunca fora dessa camada. O corte
de camadas se mantém mesmo quando a ferramenta é SQL puro. São **três** pontos, e cada um existe
porque o Prisma não expressa o que se precisa:

1. a busca textual (`tsvector`/`pg_trgm`, 9.9 — ver [`text-search.md`](../adr/text-search.md));
2. o lock que serializa a atribuição de posição das imagens de produto (9.10);
3. o lock que serializa a exclusão da última variante ativa (9.12).

Os dois últimos são o mesmo remédio — `SELECT id FROM products WHERE id = $1 FOR UPDATE` — para o
mesmo padrão: uma leitura que decide um invariante, seguida da escrita que o preserva. Não existe
como pedir lock de linha pela API do Prisma sem inventar uma coluna só para isso. Ponto novo é
decisão a justificar, não rotina.

### O tsconfig e o Biome da API estendem presets do workspace (11.3)

A rigidez do TypeScript (`strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), a
semântica de módulo (ESM, resolução de bundler, `verbatimModuleSyntax`) e o estilo do Biome
(aspas duplas, ponto-e-vírgula sempre, indentação por espaço) são regra do **monorepo**, não
preferência da API — o segundo app e o pacote de contratos têm de compilar e lintar pela mesma
régua. Por isso vivem em dois pacotes internos, `packages/tsconfig` (`@pet-oasis/tsconfig`) e
`packages/biome-config` (`@pet-oasis/biome-config`), privados, escopados, **sem build e sem
dependência de runtime** — config pura, consumida por `workspace:*`. Cada um linta a si mesmo
(`pnpm --filter tsconfig lint`, e o Turbo os pega pelo script): por isso o Biome é
`devDependency` dos dois, e o `tsconfig` estende o `biome-config` num `biome.json` próprio — o
`biome-config` é lintado pela própria base, que é o seu `biome.json`. Foram os primeiros pacotes internos do
workspace de propósito: provam que dependência interna resolve, instala e entra no lockfile com
o pacote mais barato possível, antes de o contrato depender disso.

O `tsconfig` publica um preset por alvo — `tsconfig.base.json` (a rigidez e o módulo),
`tsconfig.node.json` (base + `types: ["node"]`), `tsconfig.next.json` (base + o que o
`create-next-app` gera; nasce sem consumidor e é validado quando o web entra) e
`tsconfig.library.json` (base + `lib: ["esnext"]`, porque biblioteca que roda em servidor e em
navegador não pode depender dos globais de nenhum dos dois). O `tsconfig.json` da API estende o
de Node e guarda **só** o que é relativo ao próprio diretório: `rootDir`, `outDir`, `paths`,
`typeRoots` e `include` — caminho escrito num preset resolveria a partir do preset, não do app.
O `biome.json` da API estende a base e guarda só os ignores que são dela (Prisma gerado,
`api-collection`, `dist`, o constants de imagens fake).

Dois detalhes que não são gosto. Os presets chamam-se `tsconfig.<alvo>.json`, e não
`<alvo>.json`, porque têm comentários e o Biome só lê JSON com comentários em arquivos cujo nome
casa `tsconfig*.json` — assim o `lint` do próprio pacote os aceita sem mexer no parser JSON de
todo mundo. E os dois pacotes não declaram `peerDependencies` em `typescript` e
`@biomejs/biome`: o pnpm auto-instala peers, o que daria a cada pacote uma dependência que ele
não usa (o `tsconfig` não roda TypeScript). O que cada um declara é o que **roda** nele — o
Biome, para o `lint`. A versão única das ferramentas é assunto do `catalog:` do workspace.

A migração foi provada **sem** tocar `src/` nem `tests/`: `tsc --showConfig` (opções e lista de
arquivos) e `biome rage` idênticos antes e depois, mais um teste negativo (mudar a base e ver a
API refletir) para provar que o `extends` está vivo e não silenciosamente ignorado. A única
opção que mudou de valor depois disso foi por decisão do dono, na revisão: o `jsx: "react-jsx"`
que a API carregava desde o `tsc --init` saiu da base — nenhum preset o usa (o de Next
sobrescreve para `preserve`) e não há `.tsx` no programa; `jsx` volta a ser assunto de quem tem
JSX.

### O Turborepo é o pipeline do workspace; `test` fica fora do cache de propósito (11.4)

Com três pacotes, "rodar o `typecheck` do repo" já não é um comando: é um por pacote, numa
ordem que depende de quem consome o quê. O Turborepo (`turbo.jsonc` na raiz, `turbo` pinado
exato como devDependency da raiz) transforma isso num pipeline: cada task é o script de mesmo
nome em cada pacote que o tiver, e os scripts da raiz (`typecheck`, `lint`, `build`, `test`,
`dev`, `docs:check`) só delegam — `turbo run <task>`. `pnpm <task> --filter=@pet-oasis/api`
restringe a um pacote (o pnpm repassa a flag ao script; o Turbo exige o nome **com escopo**,
ao contrário do `pnpm --filter api`). Os scripts que são de um app (`db:*`, `dev:*`, `prod:*`,
`test:services:*`) não viram task: continuam no `package.json` dele.

O que se ganha é o cache: `typecheck`, `lint`, `build` e `docs:check` guardam logs (e o
`build`, o `dist/`) sob um hash da task, e devolvem `FULL TURBO` quando nada mudou. Dois
detalhes do hash não são óbvios e foram provados por teste negativo. **(1)** O hash de uma task
vê os arquivos do próprio pacote, as dependências externas no lockfile e o hash das tasks de
que ela depende — e **só isso**: sem um `dependsOn: ["^…"]`, mudar a base do Biome em
`packages/biome-config` devolvia o `lint` da API verde do cache. O `^` cria um nó por
dependência (mesmo sem o script — aparece como `<NONEXISTENT>` no `--dry-run`) cujo hash cobre
os arquivos dela, e é assim que o preset chega ao consumidor. Por isso `lint` tem `^lint` (a
forma do próprio exemplo do Turbo: config linta antes de quem a estende) e `typecheck` e
`build` têm `^build` — quem consome o `dist` de outro pacote precisa dele construído antes, e
a ordem já está declarada para quando o contrato tiver build. `test` não tem: não cacheia, então
o hash não importa, e ordenar atrás de um build que não existe seria adiantar uma decisão que é
da issue do contrato (fonte TS ou `dist`). **(2)** Arquivo untracked entra
no hash: o log que o Turbo grava em `<pacote>/.turbo/` fazia toda rodada ser cache miss até
`.turbo/` entrar no `.gitignore` da raiz — só a raiz, porque só o Turbo produz e o Turbo é da
raiz.

`test` não cacheia: a suíte da API sobe Postgres e Redis via Compose e lê `.env.test`, inputs
que o Turbo não vê. Cachear é decisão explícita, com esses inputs declarados — está no
[backlog](../reference/backlog.md#cachear-test-no-turborepo--m), com o método. `dev` é `persistent` e sem cache — é servidor, não resultado. E não há `env`/`globalEnv`
declarados porque nenhuma task cacheada lê ambiente (só arquivos); o modo estrito do Turbo já
deixa passar o que o Docker precisa (`HOME`, `PATH`, `DOCKER_*`), então `test` e `dev` rodam
sem `passThroughEnv`. O dia em que uma task cacheada ler ambiente é o dia em que `env` entra.

O arquivo chama-se `turbo.jsonc`, e não `turbo.json`, pelo mesmo motivo que os presets se
chamam `tsconfig.<alvo>.json`: tem comentários, e nem todo leitor de JSON os aceita — o Turbo e
o Biome sim, o validador JSON do VS Code não (abria com dezenas de erros). `.jsonc` é a forma
que a documentação do Turbo recomenda para comentário com suporte de IDE.

A raiz também tem um `biome.json` próprio, e ele é a razão de as três `biome.json` aninhadas
(API, `tsconfig`, `biome-config`) declararem `root: false`. Sem config na raiz, o editor caía
nos defaults do Biome (tabs) em qualquer arquivo dela — `turbo.jsonc`, `package.json` —, e um
salvar com formatação automática reescreveria o arquivo fora da régua do workspace. A config da
raiz estende a base **por caminho** (`./packages/biome-config/biome.json`), não pelo nome do
pacote, porque a raiz não declara `@pet-oasis/biome-config` como dependência e o pacote não
existe no `node_modules` dela; e exclui `.turbo`, porque o Biome não lê o `.gitignore` e o
cache do Turbo entraria na varredura. O `root: false` é exigência do Biome 2: com uma config na
raiz, toda config aninhada sem ele é acusada como "nested root". Ele não se propaga por
`extends` — a base o declara para lintar a si mesma, e a API continua recebendo a base (mesma
prova negativa da 11.3). O que se ganha, além do editor, é uma varredura do repositório inteiro num
comando só — com uma ressalva medida na 11.5: o `extends` por nome de pacote da API só
resolve quando o **cwd** é `apps/api` (`node_modules/.bin/biome check ../..`), porque a raiz
não tem o pacote em `node_modules` e não tem o Biome como dependência; rodado da raiz, o nome
não resolve e o check aborta. O `lint` por pacote via Turbo continua sendo o caminho
cacheado, e é ele que a CI vai rodar. Comentário dentro de `biome.json` não é aceito
(só em `biome.jsonc`, e renomear os quatro quebraria o `exports` do preset) — por isso o porquê
está aqui e não ao lado do valor.

### Conventional Commits com escopo obrigatório, recusados no hook (11.5)

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

### O CI verifica só o afetado, com os services do job no lugar do Compose (11.6)

Até aqui "verde" era um fato da máquina de quem mergeava: `pnpm test`, `typecheck` e `lint`
rodavam no host e ninguém mais via o resultado. O `.github/workflows/ci.yml` põe esse verde
fora da máquina — em todo PR e em todo push em `dev`/`main` — e o `CLAUDE.md` passa a exigir
o CI do PR verde antes de mergear fase na `dev` e `dev` na `main`. É só verificação: deploy
automático e remote cache do Turbo continuam sendo esforços próprios, não efeitos colaterais
de um workflow.

O job `verify` é um `turbo run typecheck lint docs:check test --affected`: o Turbo compara a
base (`TURBO_SCM_BASE`) com o HEAD e roda as tasks só dos pacotes com arquivo mudado. A base é
a branch-alvo no PR (`origin/<base_ref>`, com `fetch-depth: 0` para ela existir no clone) e o
commit anterior no push (`event.before`). Três coisas foram medidas antes de escrever o
workflow. **(1)** O afetado é por **pacote**, e `inputs` de task não entram no cálculo — um
`inputs: ["!docs/**"]` no `test` não impede que mudar `apps/api/docs/` rode a suíte da API.
Logo "PR só de docs não roda a suíte" vale para docs da **raiz** (README, `.github/`, o
`CLAUDE.md` da raiz), que não são de pacote nenhum, e não para `apps/api/docs/`. Filtrar por
caminho no próprio workflow (`paths-ignore`) resolveria isso ao custo de pular também o
`docs:check` — justamente o que um PR de docs precisa —, então a limitação ficou. **(2)** Base
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
está no [backlog](../reference/backlog.md#envexample-com-sentry_dsn-vazio-não-passa-no-envts--p)); e os tetos de rate limit do
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

---

## Ordem de construção

### Perfis antes de user↔role

Atribuir role exige o perfil compatível já existir. Se user↔role viesse antes, dependeria de algo
inexistente. Detalhe em [authorization.md](authorization.md#perfis-vêm-antes-de-userrole).

### Primitiva de repositório antes da rota que a expõe

Quando uma mecânica serve a três níveis e só um tem rota, os três nascem juntos no repositório, com
os sem-rota cobertos por teste de integração chamando o repositório direto. Foi assim com a
restauração (K7) — ver [lifecycle.md](lifecycle.md#os-três-níveis-nasceram-como-primitivas-de-repositório-k7).

### Código reaproveitado entre entrypoints não pode carregar auto-execução

Lição do reseed compartilhado (7.14) — ver
[infrastructure.md](infrastructure.md#gotcha-do-reseed-compartilhado-714).

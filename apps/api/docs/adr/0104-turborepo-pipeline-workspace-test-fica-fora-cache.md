# O Turborepo é o pipeline do workspace; `test` fica fora do cache de propósito (11.4)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Arquitetura** › *Onde cada coisa vive*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Com três pacotes, "rodar o `typecheck` do repo" já não é um comando: é um por pacote, numa
ordem que depende de quem consome o quê. O Turborepo (`turbo.jsonc` na raiz, `turbo` pinado
exato como devDependency da raiz) transforma isso num pipeline: cada task é o script de mesmo
nome em cada pacote que o tiver, e os scripts da raiz (`typecheck`, `lint`, `build`, `test`,
`dev`) só delegam — `turbo run <task>`. (O `docs:check` nasceu aqui como task cacheada e
**deixou de ser** na 11.7 — ver o fim deste ADR.) `pnpm <task> --filter=@pet-oasis/api`
restringe a um pacote (o pnpm repassa a flag ao script; o Turbo exige o nome **com escopo**,
ao contrário do `pnpm --filter api`). Os scripts que são de um app (`db:*`, `dev:*`, `prod:*`,
`test:services:*`) não viram task: continuam no `package.json` dele.

O que se ganha é o cache: `typecheck`, `lint` e `build` guardam logs (e o
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
[backlog](../../../../docs/reference/backlog.md#cachear-test-no-turborepo--m), com o método. `dev` é `persistent` e sem cache — é servidor, não resultado. E não há `env`/`globalEnv`
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

**`docs:check` saiu do Turbo na 11.7 — reversão do que este ADR decidiu na 11.4.** Quando a
ferramenta subiu para `tools/` da raiz e passou a varrer o monorepo inteiro (a documentação de
um app cita a do outro, e o tracker e o `todo.md` vivem na raiz), a task por pacote deixou de
fazer sentido: o recorte "roda o script de cada pacote que o tiver" esconderia justamente a
citação cruzada, e a raiz não é pacote do workspace. `docs:check` virou **script da raiz**
(`tsx tools/check-docs-links.ts`), sem cache — é uma varredura de segundos sobre arquivos, e o
que se perde é `FULL TURBO` num comando que nunca foi o gargalo. O que sobrou de raiz no
Turbo são duas tasks (`//#typecheck:root`, `//#lint:root`) que cobrem `tools/` e ficam
penduradas no `dependsOn` de `typecheck` e `lint`, com `inputs` restritos a `tools/`, ao
`tsconfig.json` da raiz e aos presets que ele estende — pelo mesmo motivo do `^` acima: preset
fora do hash é cache verde depois de a régua mudar. O README da raiz já não lista `docs:check`
entre as tasks cacheadas.

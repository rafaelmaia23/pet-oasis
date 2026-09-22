# O Pet Oasis é um monorepo, migrado in-place, com pnpm workspaces e Turborepo

> Decisão de sistema, tomada na Fase 11 em três rodadas de grelha (2026-09-17) e executada nas
> issues 01–18 de `.scratch/fase-11-monorepo/`. Vale para o repositório inteiro. É a decisão
> que dá origem às demais desta fase — cada uma delas tem ADR próprio, listado abaixo, e este
> guarda o *porquê* do todo.

O Pet Oasis era **dois repositórios que compartilhavam zero código e um acoplamento
implícito**. A API definia os schemas Zod de request e de resposta; o front, num repo irmão,
teria de reescrevê-los à mão — e cada mudança de contrato na API viraria um bug silencioso no
web, visível só em runtime, sem type-check nenhum atravessando a fronteira. Com um terceiro
cliente (mobile, back-office), seriam três cópias do mesmo contrato envelhecendo em ritmos
diferentes. O acoplamento vazava para a infra (o Compose do web dependia de uma rede que
"torcia" para o Compose da API ter criado) e para a documentação (o `CLAUDE.md` do web apontava
para guias da API por `../pet-oasis-api/…`, caminho que só existe na máquina de quem clonou os
dois lado a lado). E o modo de trabalho divergia: a API tinha `dev`/`main`/fases, o web só
`main` + feature branches; as versões de TypeScript, Biome e `@types/node` já eram outras em
cada um.

**Decidimos unificar os dois num único repositório**, `pet-oasis`, com `apps/api`, `apps/web` e
`packages/*` — e, junto, um fluxo de branches só, uma convenção de commit só, um CI só e uma
numeração de fase global ao sistema. O que justifica o monorepo é **a fronteira tipada**: o
contrato compartilhado (`packages/api-contracts`) faz uma mudança de schema na API quebrar o
`typecheck` do web **no mesmo PR**, e é isso que nenhum arranjo de dois repositórios entrega
sem publicar e versionar um pacote.

**In-place, não repo novo.** O repositório é o mesmo: `pet-oasis-api` foi renomeado, a API
desceu para `apps/api` num commit de move e o web entrou depois, com o histórico reescrito por
`git filter-repo --to-subdirectory-filter apps/web` e mergeado com `--allow-unrelated-histories`.
Histórico, branches, remotes e o fluxo de fases sobrevivem; nenhum commit do web se perde, e
`git log --follow` atravessa a importação. O commit do move entra no `.git-blame-ignore-revs` da
raiz, para que o `blame` (e o GitHub) pulem o move e mostrem o autor real de cada linha. A
alternativa — repositório novo, com o histórico dos dois jogado fora ou preservado só num
arquivo — custaria a arqueologia do código, que é justamente o que este projeto usa para
aprender.

**Uma camada por issue, não um big bang.** A ordem foi pnpm no pacote único → layout
`apps/api` como workspace-de-um → configs compartilhadas → Turborepo → commitlint → CI →
esqueleto de docs da raiz → glossário → contrato → import do web → o web consumindo o contrato
→ fecho. O pnpm veio **antes** do move de diretório de propósito: a estritez dele (nenhum
import de dependência não declarada) devia aparecer com a suíte inteira verde como oráculo, sem
confundir "quebrou pelo pnpm" com "quebrou pelo move". O contrato veio antes do web porque a
extração é refactor interno da API, guiado pela suíte dela; o CI veio antes do import para o
import já nascer verificado. O projeto é de estudo e portfólio: **aprender monorepo é entrega**,
e uma tecnologia por issue, cada uma com critério de aceite próprio, é o que ensina o que cada
camada faz e o que quebra quando ela falta.

**pnpm, e não npm workspaces ou Yarn.** Três razões, nesta ordem: a **estritez** (um pacote só
enxerga o que declarou, então a fronteira entre pacotes é real e não convenção — foi ela que
expôs duas dependências fantasma na API já na primeira issue); o `catalog:`, que fixa **uma
versão** por dependência compartilhada num lugar só; e o `pnpm deploy --filter`, que poda a
imagem de produção de cada app sem o workspace inteiro junto. **Turborepo, e não scripts
encadeados**, porque `typecheck`, `lint` e `build` passam a custar o preço do que mudou: o
cache local devolve `FULL TURBO` quando o hash bate, e `--affected` é o que deixa o CI rodar
só os pacotes que um PR tocou.

**O contrato é a fronteira, e enum tem dois donos.** `packages/api-contracts` é o que atravessa
a rede entre a API e os clientes, e **só depende de `zod`** — o que precisa de Prisma, Express
ou de um helper de servidor não é contrato e fica na API, como composição por cima do schema.
O Prisma continua dono do enum no banco; o contrato é dono do que atravessa a rede; os dois são
editados juntos, e um teste de paridade é o que garante o "juntos". Duas guardas, não duas boas
intenções: a pureza do pacote é teste no próprio pacote, a paridade dos enums é teste na API. O
detalhe de cada fronteira está em
[`apps/api/docs/adr/0198`](../../apps/api/docs/adr/0198-contrato-consumido-do-fonte-ts-so-depende-de-zod-enum-dois-donos.md)
e [`0199`](../../apps/api/docs/adr/0199-schemas-de-request-e-views-sao-codigo-do-contrato.md); a
tabela de rotas e o nome de feature, que a grelha pós-import acrescentou ao contrato, em
[`0003`](0003-route-table-is-contract-openapi-is-derived.md) e
[`0004`](0004-feature-names-cross-the-wire-as-enum.md).

**O que ficou de fora, de propósito.** Cada item é esforço próprio, e entrar aqui só teria
diluído a fase:

- **Deploy automático** (SSH no VPS no merge em `main`). Revisitar quando o merge em `main`
  deixar de ser um ato consciente do dono — hoje ele é, e é isso que protege a demo.
- **Remote cache do Turborepo.** Revisitar quando o CI passar a custar tempo de espera real, ou
  quando houver uma segunda máquina trabalhando no repo: com um desenvolvedor e um runner, o
  cache local já paga.
- **Cachear `test` no Turbo.** A suíte da API sobe Postgres via Compose e lê `.env.test`;
  cachear exigiria declarar esses inputs, e o risco é **falso-verde** — o pior defeito possível
  numa suíte. Está em [`docs/reference/backlog.md`](../reference/backlog.md) com o método, e
  revisitar quer dizer declarar os inputs e provar a invalidação, não ligar a flag.
- **Versionar ou publicar o contrato, e quebrá-lo por domínio.** Enquanto os consumidores
  vivem no mesmo repo, `workspace:*` já é a versão certa, sempre. Revisitar no dia em que um
  cliente **fora** do monorepo precisar consumi-lo.
- **Apps novos (Expo, Angular) e seus presets**, que entram quando existirem — inclusive no
  enum de escopos do commitlint.

As demais decisões da fase têm ADR próprio, e estão no índice: a fonte única de Node, pnpm e
versões em [`0006`](0006-one-source-for-node-pnpm-and-one-version-per-dependency.md); o stack
Compose e as imagens em [`0007`](0007-single-compose-stack-one-image-per-app.md); a forma do
tracker em [`0002`](0002-tracker-folders-are-phases.md) e a da documentação em
[`0001`](0001-domain-docs-follow-the-skill.md); do lado da API, os presets compartilhados
([`0103`](../../apps/api/docs/adr/0103-tsconfig-biome-api-estendem-presets-workspace.md)), o
pipeline do Turbo
([`0104`](../../apps/api/docs/adr/0104-turborepo-pipeline-workspace-test-fica-fora-cache.md)),
os commits ([`0196`](../../apps/api/docs/adr/0196-conventional-commits-escopo-obrigatorio-recusados-hook.md))
e o CI ([`0197`](../../apps/api/docs/adr/0197-ci-verifica-so-afetado-services-do-job-no-lugar-do-compose.md)).

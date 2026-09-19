# 07: Esqueleto de documentação da raiz

**What to build:** a raiz do monorepo passa a ter o que vale para o sistema inteiro —
`CLAUDE.md` geral, `CONTEXT-MAP.md`, `docs/` com ADRs de sistema, `docs/todo.md` e `.scratch/`
únicos — e o `CLAUDE.md` da API encolhe para o que é específico da stack dela. ADRs passam a
ser numerados numa convenção só. O `docs:check` cobre o repo inteiro.

**Blocked by:** 02.

**Status:** fechada em 2026-09-18

O que de fato ficou pronto — onde divergiu do plano, o porquê está ao lado:

- [x] `CLAUDE.md` da raiz: o que é o projeto e o mapa do monorepo, a regra "nunca decida regra de
      negócio", "TDD sempre" com o fluxo de branches (uma só numeração de fase para o sistema),
      a convenção de commits **já na forma Conventional Commits com escopo** que a issue 05 fixa
      (para os dois merges não divergirem) e a proibição de trailer, "prefira os scripts", onde
      mora cada documento, como ler o contexto (mapa → glossário → índice → um ADR), pendência
      para a frente, o pipeline `grill-with-docs → to-spec → to-tickets → implement` e a config
      das skills. Tudo isso saiu do `CLAUDE.md` da API, sem duplicar.
- [x] `apps/api/CLAUDE.md` ficou com stack, camadas, módulos, regras de negócio já decididas,
      convenções de código e comandos — mais uma seção "onde está a documentação da API" — e
      aponta para a raiz para o resto.
- [x] `CONTEXT-MAP.md` na raiz, no formato da skill: contextos **API** (`apps/api/CONTEXT.md`,
      nomeado embora ainda não exista — issue 08) e **Web** (`apps/web/CONTEXT.md`, issue 11), e
      as relações (BFF, contrato compartilhado). Os caminhos inexistentes são texto, não link,
      para o `docs:check` não os cobrar antes da hora.
- [x] `docs/` da raiz: `README.md` (mapa do monorepo: o que é do sistema, o que é de cada app),
      `adr/0001-domain-docs-follow-the-skill.md` (a decisão desta issue: skill sem adaptação, a
      migração do `docs/context/`, a queda da regra de citação do tracker), `todo.md` movido
      (Fase 11 na forma aberta, progresso atualizado), `reference/backlog.md` movido,
      `guides/todo-phases.md` movido (é o molde do `todo.md`, então acompanha), `agents/`
      movido e reescrito para multi-contexto (`domain.md` inteiro; `issue-tracker.md` e
      `todo-phases.md` só onde diziam `docs/context/`).
- [x] `.scratch/` da raiz é o único tracker: `fase-10-frontline/`, `monorepo/` e o `README.md`
      subiram por move (histórico preservado; commit de move puro, separado). O `README.md`
      do tracker passou a dizer que **tudo ali é citável**, com o porquê no ADR 0001.
- [x] Os 10 ADRs da API viraram `0001`–`0010` na ordem cronológica dos commits que os criaram
      (`auth-token-revocation` → `environments-and-deploy` → `rate-limiting-and-lockout` →
      `pagination` → `authorization-scope-and-lifecycle` → os cinco da Fase 9 na ordem das
      sub-fases). Todo link para eles foi corrigido — inclusive os 6 em comentário de `src/` e
      `tests/` —, e o `docs:check` é a prova.
- [x] **O `docs/context/` foi migrado inteiro, e não congelado** (decisão do dono no kickoff,
      entre as duas opções que a issue previa; granularidade também decidida por ele: **um ADR
      por decisão `###`**). Resultado: 185 ADRs novos (`0011`–`0195`), numerados na ordem do
      índice antigo (tema a tema, e dentro do tema a ordem do arquivo), com o texto original e
      uma linha de proveniência (tema › grupo); os seis grupos de `pet-domain.md` que eram
      resumo de um ADR existente foram **anexados** ao ADR correspondente como "Resumo e notas de
      execução"; `schema.md` e `history.md` (descrição, não decisão) foram para
      `apps/api/docs/reference/`; o `context.md` virou `apps/api/docs/adr/README.md`, o índice
      por tema (grupos como `####`, para as âncoras existirem). As 140 citações a
      `docs/context/*` e as ~20 a `context.md` — em docs, guias, `src/`, `tests/`, Compose,
      backlog, `todo.md` e specs/issues fechadas — foram reapontadas por script e revisadas à
      mão: onde a citação nomeava a seção (`§ "…"`), aponta o ADR específico; onde nomeava só o
      tema, aponta a seção do índice. A linha `Status: fechada` da spec da Fase 10 continua
      válida, apontando para as seções do índice.
- [x] A ferramenta do `docs:check` vive em `tools/check-docs-links.ts` da raiz e varre todo
      `**/*.md`, `.ts`, `.json`, `.jsonc`, `.yml`, `.bru` do monorepo. Menção em prosa
      `docs/<arquivo>.md` resolve contra o **pacote** do arquivo (raiz, `apps/*`, `packages/*`), com a
      raiz como segunda tentativa; de fora do app, `apps/api/docs/<arquivo>.md` resolve da raiz. A
      checagem de "documento permanente cita efêmero" e a lista de exceções dela **caíram**; a
      checagem de spec fechada continua e aceita destino com prefixo de app. O racional original
      da regra foi reescrito narrando a reversão em `apps/api/docs/reference/history.md` e no
      ADR 0001. `docs:check` é **script da raiz, não task do Turbo** (varre o repo inteiro de
      uma vez; saiu do `turbo.jsonc` e do `package.json` da API); `tools/` é coberto por
      `typecheck`/`lint` via tasks de raiz (`//#typecheck:root`, `//#lint:root`, com `inputs`
      restritos a `tools/`), penduradas em `dependsOn` das tasks de pacote. A raiz ganhou
      `tsconfig.json` (só `tools/`), `tsx`, `typescript`, `@types/node`, `@biomejs/biome` e
      `@pet-oasis/tsconfig` como devDependencies.
- [x] `docs/context/` deixou de existir; "acrescentar uma decisão" é escrever um ADR mais a
      linha no índice do app — dito no `CLAUDE.md` da raiz, no da API, em `docs/agents/domain.md`
      e no próprio índice ("Como manter").
- [x] `docs:check` + `lint` + `typecheck` verdes na raiz; suíte da API verde.

Revisão (`/code-review`, dois eixos) e merge da `fase-11` no meio da issue — o que mudou depois
do primeiro fecho:

- A `fase-11` tinha recebido a issue 05 depois de esta branch nascer, e a 05 escreveu a decisão
  dela no contexto temático de arquitetura — arquivo que esta branch apaga. No merge, a seção
  virou o ADR `0196-conventional-commits-escopo-obrigatorio-recusados-hook.md` (linha no índice,
  tema *Arquitetura*), o item de backlog da 05 caiu no `docs/reference/backlog.md` da raiz, e a
  ressalva da 05 sobre o `biome check` da raiz entrou no ADR 0104. Progresso: 6 de 14.
- O ADR 0104 (migrado) ainda dizia que `docs:check` era task cacheada do Turbo — reescrito
  narrando a reversão desta issue, como a regra manda. A task `//#typecheck:root` passou a ter
  os presets de `packages/tsconfig` nos `inputs` (preset fora do hash é cache verde depois de a
  régua mudar — o furo que o próprio `turbo.jsonc` narra).
- 16 rótulos de link ficaram com o nome do arquivo antigo (`[lifecycle.md](0054-…)`); viraram o
  número do ADR. O `docs:check` não vê rótulo, só alvo.
- `CLAUDE.md` da raiz: o CI de commits é a issue 06, ainda por construir (dizia "e, depois, pelo
  CI"); a nuance do `sentence-case` da 05 entrou; "1–3 parágrafos" virou "1–3 frases ou o que a
  decisão pedir", que é o que o `ADR-FORMAT.md` da skill diz (também em `domain.md` e no índice).
- `pnpm run docs:check` → `pnpm docs:check` em todo lugar; o diagrama de `docs/README.md` ganhou
  o passo `/to-spec`; a ferramenta passou a ter o padrão de caminho num só lugar (`DOC_PATH`).
- Issues 08 e 13 e a spec (§ "Documentação e modo de trabalho", § "Fecho") ainda diziam que o
  `docs/context/` continuava existindo — anotadas com a revisão, no idioma já usado em "Out of
  Scope".
- Fora do escopo desta issue e deixado como está: o `CONTEXT-MAP.md` nomeia o glossário da API
  como texto (a skill cria lazy; a issue pediu nomear), e a linha `Status:` da spec da Fase 10
  aponta para seções do índice, não para ADRs individuais — as decisões dela estão espalhadas
  por dezenas de ADRs, e o índice é o endereço honesto.

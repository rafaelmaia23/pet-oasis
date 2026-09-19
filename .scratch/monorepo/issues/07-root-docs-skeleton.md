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

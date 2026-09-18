# 07: Esqueleto de documentação da raiz

**What to build:** a raiz do monorepo passa a ter o que vale para o sistema inteiro —
`CLAUDE.md` geral, `CONTEXT-MAP.md`, `docs/` com ADRs de sistema, `docs/todo.md` e `.scratch/`
únicos — e o `CLAUDE.md` da API encolhe para o que é específico da stack dela. ADRs passam a
ser numerados numa convenção só. O `docs:check` cobre o repo inteiro.

**Blocked by:** 02.

**Status:** ready-for-agent

- [ ] `CLAUDE.md` da raiz: o que é o projeto, o mapa do monorepo (apps, packages, o que cada
      um é), o fluxo de branches e fases, a convenção de commits, a regra "nunca decida regra de
      negócio", "TDD sempre", "nenhum trailer de agente", como ler contexto pelo índice, onde
      mora cada tipo de documento, e o pipeline de trabalho das skills (`grill-with-docs →
      to-spec → to-tickets → implement`). Tudo que hoje está no `CLAUDE.md` da API e **não** é
      específico dela migra para cá, sem duplicar.
- [ ] `apps/api/CLAUDE.md` fica só com stack, arquitetura em camadas, organização de módulos,
      regras de negócio já decididas, convenções de código e comandos da API — e aponta para a
      raiz para o resto.
- [ ] `CONTEXT-MAP.md` na raiz, no formato da skill `domain-modeling`: um contexto por app, com
      o caminho do `CONTEXT.md` de cada um (o da API ainda não existe — issue 08 — e o mapa já
      o nomeia).
- [ ] `docs/` da raiz: `README.md` (mapa da documentação do monorepo), `adr/` (decisões de
      sistema, numeradas `NNNN-slug.md`), `todo.md` (o índice das fases, movido da API, com a
      Fase 11 na forma aberta), `reference/backlog.md` movido, `agents/` (issue tracker, triage
      labels, domain docs — atualizados para "multi-contexto, `CONTEXT-MAP.md` na raiz").
- [ ] `.scratch/` da raiz é o único tracker: as pastas das fases fechadas da API migram para
      cá com histórico (move), inclusive esta.
- [ ] Os ADRs da API são renomeados para `NNNN-slug.md` em ordem cronológica; todo link para
      eles é corrigido — o `docs:check` é a prova.
- [ ] A ferramenta do `docs:check` vive em `tools/` da raiz e varre todo `**/*.md` do monorepo e
      os comentários de `src/` de todos os apps, com as regras de caminho e âncora existentes.
      **A regra "documento permanente não cita `.scratch/`" cai** (decidida em 2026-09-18, na
      revisão da issue 02): as issues em `.scratch/` são o tracker versionado do fluxo das
      skills, arquivos fixos com endereço estável, e citá-los de um ADR, de um contexto ou do
      `CLAUDE.md` é o correto — é como a skill original funciona. O `docs:check` deixa de ter a
      checagem de citação efêmera e a lista de exceções dela; o que ele continua provando é que
      o caminho citado existe (inclusive quando é um arquivo de `.scratch/`). A checagem da
      spec fechada (`Status: fechada em … — porquê promovido a …`) continua, com o destino
      passando a ser o ADR (ver o item seguinte). O racional da regra original (9.12/AC5, "um
      ADR citou um § de um documento descartável") é **reescrito narrando a reversão**: o que
      mudou foi a natureza do arquivo, que deixou de ser descartável.
- [ ] **Documentação de domínio no formato da skill, sem adaptação** (decidido em 2026-09-18):
      `CONTEXT-MAP.md` na raiz e `CONTEXT.md` por app são **glossário puro**, no
      `CONTEXT-FORMAT.md` da skill `domain-modeling`; toda decisão **com explicação** vive em
      ADR, no `ADR-FORMAT.md` da skill, numerado. O `docs/context/` da API **deixa de receber
      decisão nova** — a partir desta issue, "acrescentar uma decisão" é escrever um ADR, e o
      `CLAUDE.md`/`docs/agents/domain.md` passam a dizer isso. O que fazer com o conteúdo já
      existente de `docs/context/` (11 arquivos, > 25 mil tokens) é decisão a fechar no kickoff
      desta issue, com o dono: (a) migrar tudo para ADRs agora, temático por temático, e apagar o
      `docs/context/`; (b) congelar o `docs/context/` como histórico somente-leitura (índice
      mantido, nada novo entra) e migrar por demanda, cada decisão virando ADR na primeira vez
      em que for tocada. A spec listava "migrar o `docs/context/`" como fora de escopo; essa
      linha foi anotada com a mudança.
- [ ] `docs:check` + `lint` + `typecheck` verdes.

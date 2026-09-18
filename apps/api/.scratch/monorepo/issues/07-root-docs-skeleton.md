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
      os comentários de `src/` de todos os apps, com as mesmas regras (caminho e âncora existem;
      documento permanente não cita `.scratch/`).
- [ ] `docs:check` + `lint` + `typecheck` verdes; nenhum documento permanente cita `.scratch/`.

# 15: O tracker se chama pelo número da fase

**What to build:** quem lista `.scratch/` vê as fases em ordem cronológica, e sabe de cada
pasta a qual fase (e a qual branch) ela corresponde sem abrir nada: toda pasta do tracker é
`fase-<n>-<slug>/`, flat, sem zero à esquerda. Pasta = fase; não existe pasta sem número. O
padrão é provado pelo `docs:check` e explicado num ADR de sistema — é o segundo desvio
consciente do que a skill de setup prescreve (`<feature-slug>` sem ordem), depois do
`docs/adr/0001`, e pela mesma razão: uma fase atravessa apps, então subpasta por app não cabe.

**Blocked by:** None (can start immediately).

**Status:** done (2026-09-21)

- [x] `monorepo/` virou `fase-11-monorepo/` e `foundation-and-auth-spine/` virou
      `fase-12-web-auth-spine/` (`git mv`, histórico preservado); `fase-10-frontline/` já
      estava no padrão.
- [x] Toda citação aos caminhos antigos corrigida — ADRs `0197`–`0199` da API e `0001` da
      raiz, `CLAUDE.md` da raiz e do web, README do web, `todo.md`, issue 11 desta fase (a
      menção histórica ganhou "renomeada na issue 15"). A prova precisou de uma peça a mais do
      que a issue previa: o `docs:check` só checava menção em prosa a `docs/**.md` — uma
      citação à issue 07 pelo caminho antigo da pasta passava em branco, apesar de o ADR `0001`
      dizer que era provada. Ele passou a checar toda menção a `.scratch/<pasta>/` ou a um
      arquivo dela (resolvida da raiz; placeholder `<slug>` não casa), e foi essa checagem que
      listou as dez citações a corrigir.
- [x] `docs:check` ganhou a regra: cada diretório de `.scratch/` casa com
      `fase-[1-9]\d*-<kebab>` e contém `spec.md`; violação sai vermelha com o nome da pasta
      (provado com `checkout/`, `fase-013-x/` e `fase-13-no-spec/`).
- [x] ADR de sistema `docs/adr/0002-tracker-folders-are-phases.md`: pasta = fase, número
      global ordena e casa com a branch, por-app rejeitado, sem zero à esquerda; não há
      README em `docs/adr/`, então os dois ADRs de sistema ganharam ponteiro na linha de `adr/`
      da tabela de `docs/README.md`.
- [x] README do tracker e `docs/agents/issue-tracker.md` descrevem o padrão (seção "pasta =
      fase"), os três destinos do trabalho que não é fase, "esforço" → "fase" em todo o
      vocabulário do tracker (também no `CLAUDE.md`, `docs/README.md`, `todo-phases.md`,
      `todo.md` e no cabeçalho do `check-docs-links.ts`), com ponteiro para o ADR; o
      `CLAUDE.md` da raiz cita o padrão na tabela do mapa, na regra de branches e na seção do
      TODO.
- [x] `todo.md`: ponteiros das Fases 11 e 12 atualizados; a entrada da 12 aponta para as
      issues 16 e 17 desta fase; progresso da 11 em 12 de 17.
- [x] `typecheck`, `lint` e `docs:check` verdes.

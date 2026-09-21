# 15: O tracker se chama pelo número da fase

**What to build:** quem lista `.scratch/` vê as fases em ordem cronológica, e sabe de cada
pasta a qual fase (e a qual branch) ela corresponde sem abrir nada: toda pasta do tracker é
`fase-<n>-<slug>/`, flat, sem zero à esquerda. Pasta = fase; não existe pasta sem número. O
padrão é provado pelo `docs:check` e explicado num ADR de sistema — é o segundo desvio
consciente do que a skill de setup prescreve (`<feature-slug>` sem ordem), depois do
`docs/adr/0001`, e pela mesma razão: uma fase atravessa apps, então subpasta por app não cabe.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] `monorepo/` vira `fase-11-monorepo/` e `foundation-and-auth-spine/` vira
      `fase-12-web-auth-spine/` (`git mv`, histórico preservado); `fase-10-frontline/` já
      está no padrão.
- [ ] Toda citação aos caminhos antigos corrigida — ADRs da API e da raiz, `CLAUDE.md` da raiz
      e do web, README do web, `todo.md`, issues desta fase, README do tracker — e `pnpm
      docs:check` verde é a prova de que nenhuma ficou para trás.
- [ ] `docs:check` ganha a regra: cada diretório em `.scratch/` casa com `fase-<n>-<slug>` e
      contém `spec.md`; violação é saída vermelha com o nome da pasta.
- [ ] ADR de sistema novo (`docs/adr/0002-<slug>.md`, próximo número livre): pasta = fase,
      número global ordena, por-app rejeitado porque fase atravessa apps, sem zero à esquerda
      porque a branch é `fase-11`; índice/README de `docs/adr/` atualizado se houver.
- [ ] README do tracker e `docs/agents/issue-tracker.md` descrevem o padrão, dizem o que fazer
      com trabalho que não é fase (branch solta, backlog ou issue na fase aberta), trocam
      "esforço" por "fase" e apontam para o ADR; o `CLAUDE.md` da raiz cita o padrão na tabela
      do mapa e na seção do TODO.
- [ ] `todo.md`: ponteiros das Fases 11 e 12 atualizados; a entrada da 12 deixa de dizer
      "começa pela issue 00, dois pedidos ao contrato" e passa a apontar para as issues 16 e 17
      desta fase.
- [ ] `typecheck`, `lint` e `docs:check` verdes.

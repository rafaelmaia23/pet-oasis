# 15: A forma velha de registrar rota sai (contract)

**What to build:** o repo deixa de ter duas maneiras de registrar uma rota. Com as 79 rotas já sob o
registrador, a forma antiga não tem mais caller — e o teste de paridade que compara `MÉTODO path`
entre contrato e router deixa de ser load-bearing: a concordância passou a ser estrutural, não
vigiada por monkey-patch do router do Express.

**Blocked by:** 09, 10, 11, 12, 13, 14.

**Status:** ready-for-agent

- [ ] Nenhuma rota registra fora do registrador — provado por busca, não por memória
- [ ] A forma antiga de registro é removida
- [ ] O teste de paridade de rotas é removido ou reduzido ao que o registrador não cobre, e o
      monkey-patch do router sai junto
- [ ] Se algo do teste de paridade ainda é a única prova de algo, isso é dito em voz alta e migra
      para o teste do registrador ou para os invariantes da tabela (issue 02) — nunca se perde em
      silêncio
- [ ] `apps/api/CLAUDE.md` deixa de descrever a camada pela forma antiga. Duas frases ficaram
      falsas conforme as rotas migraram, e só aqui elas passam a ser falsas para **todas**: a
      "Organização de módulos" lista `*.presenter.ts` como parte de todo módulo (já saíram cinco,
      e sobram os que decidem conteúdo, como o `maskIp` do audit log), e a seção Validação diz
      "sintática (Zod, sem banco) **no controller**", quando quem parseia o envelope é o
      registrador. Levantado pela revisão da issue 09
      (`.scratch/fase-12-module-depth/issues/09-rotas-de-role-feature-e-permission.md`)
- [ ] Suíte, `typecheck`, `lint` e `docs:check` verdes

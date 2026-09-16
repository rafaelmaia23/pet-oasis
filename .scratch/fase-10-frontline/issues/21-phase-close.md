# 21: Fecho da Fase 10

**What to build:** o ritual de fecho de `docs/guides/todo-phases.md`, mais dois itens que a spec
mandava fazer "no fecho" e que estavam pendurados na issue 14 (fechada como trabalho de front).

**Blocked by:** nada — 04, 06, 10 e 20 fecharam em 2026-09-16. É a última issue da fase.

**Status:** ready-for-agent

**Triagem:** ready-for-agent — nenhuma decisão de negócio; é o procedimento escrito no guia.

- [ ] O aviso "⚠️ Este guia descreve o estado-alvo da Fase 10" no topo de
      `docs/guides/integrating-with-the-api.md` sai (a spec: "O aviso sai no fecho").
- [ ] `docs/reference/backlog.md`: as entradas de "Necessidades do front web" são marcadas como
      resolvidas; a premissa "guardar o hash anterior na sessão" (item "Janela de graça na rotação
      do refresh token", ~linha 188) é **reescrita narrando a correção** da 10.7 (o par em texto
      claro no Redis, chaveado pelo hash apresentado — não coluna na `Session`), do mesmo jeito
      que a de "dois saltos" já foi (linha ~228, feito na 10.2).
- [ ] Achado do deploy da 04 ganha dono em `docs/context/infrastructure.md` (na decisão da 10.4):
      redeploy que preserva o volume do banco mas troca o container deixa as linhas de imagem
      apontando para bytes que morreram com ele; o seed do boot é idempotente e não regrava; o
      sintoma é 404 em toda imagem com `SEEDING COMPLETED!` limpo; o conserto numa demo é o
      `demo-reset`. E o `deploy.md` § "Diretório de uploads" diz para criar o diretório **antes**
      do primeiro `prod:up` com `chown 1000:1000` — no host real ele nasceu de `opc`, que por
      coincidência é 1000; vale uma linha dizendo que é o número que importa, não o nome.
- [ ] Tabela de rastreio decisão → dono permanente: cada decisão de "Implementation Decisions" da
      `spec.md` tem `###` em `docs/context/` ou ADR. Conferir uma a uma; escrever o dono que
      faltar. Atenção às reescritas tardias (06: nome, sem 301, NPM + Cloudflare; 14: fechada do
      lado do backend — a "ordem obrigatória" da spec foi relaxada por decisão do usuário, e o
      contexto precisa narrar isso).
- [ ] Primeira linha da `spec.md` vira `Status: fechada em <AAAA-MM-DD> — porquê promovido a
      <caminhos>`.
- [ ] `docs/todo.md`: o bloco da Fase 10 encolhe para a forma de fase fechada (~10 bullets, um
      por grupo de issues, com os ponteiros).
- [ ] Suíte completa + `typecheck` + `lint` + `docs:check` verdes na `fase-10`.
- [ ] Merge `fase-10` → `dev` (`--no-ff`); suíte verde na `dev`; merge `dev` → `main`; nova
      `dev` a partir da `main`.

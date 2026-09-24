# 19: Fecho do esforço

**What to build:** o esforço fecha com o *porquê* tendo dono permanente, o índice contando o
resultado, e a dívida que ele conscientemente não pagou registrada onde alguém vai encontrar.

**Blocked by:** 02, 03, 04, 05, 06, 07, 15, 16, 17, 18. (A 01 não bloqueia: se o acesso ao GitHub não
tiver sido configurado, o fecho acontece com push e PR manuais.)

**Status:** fechada em 2026-09-24

- [x] ADR na API para o registrador de rota:
      `apps/api/docs/adr/0206-registerroute-tabela-ganha-segundo-adapter-teste-de-paridade-morre.md`
      — a tabela ganhou um segundo adapter (`registerRoute`), o teste de paridade morreu, e as 79
      rotas migradas (um commit por rota) são a evidência. Linha no índice,
      `apps/api/docs/adr/README.md#roteamento`.
- [x] Tabela de rastreio decisão → destino conferida: as três decisões que a spec marcava "ADR
      antes/no fecho" têm dono (`0203`, `0204`, `0205`, `0206`); as que reforçavam decisão já
      registrada (`0069`, `0011`, `0095`) não pediam ADR novo, e não ganharam um. A issue 12 estava
      com o código pronto e mergeado mas o checklist e o `Status:` sem atualizar — achado da issue
      15 (`.scratch/fase-12-module-depth/issues/15-a-forma-velha-de-registrar-rota-sai.md`, seção
      "Achado à parte") e corrigido aqui: `.scratch/fase-12-module-depth/issues/12-rotas-de-pet.md`.
- [x] A primeira linha da spec virou `Status: fechada em 2026-09-24 — porquê promovido a <caminhos>`,
      apontando os quatro ADRs e `docs/todo.md`.
- [x] O bloco destilado do esforço entrou no índice das fases, sob o capítulo da Fase 12
      (`docs/todo.md`) — a fase continua `🔄` porque `fase-12-web-auth-spine` segue aberta.
- [x] O enxugamento da suíte de integração entrou no backlog
      (`docs/reference/backlog.md`, seção *Testes*), com o problema (19.080 linhas duplicando
      cobertura com o unitário novo, com exemplos concretos) e o tamanho estimado (**G**) — nesta
      issue não se apagou teste nenhum.
- [x] Nem 17 nem 18 foram cortadas — as duas entregaram o ADR e o código; não há metade feita a
      registrar.
- [x] Suíte (**1452** testes, 88 arquivos), `typecheck`, `lint` e `docs:check` verdes. `gh auth
      status` confirma a conta autenticada (issue 01); o PR do esforço para a `dev` é o próximo
      passo, fora desta issue.

# 19: Fecho do esforço

**What to build:** o esforço fecha com o *porquê* tendo dono permanente, o índice contando o
resultado, e a dívida que ele conscientemente não pagou registrada onde alguém vai encontrar.

**Blocked by:** 02, 03, 04, 05, 06, 07, 15, 16, 17, 18. (A 01 não bloqueia: se o acesso ao GitHub não
tiver sido configurado, o fecho acontece com push e PR manuais.)

**Status:** ready-for-agent

- [ ] ADR na API para o registrador de rota: a tabela ganhou um segundo adapter, o teste de paridade
      morreu, e por quê — a decisão tem 79 rotas como evidência
- [ ] Tabela de rastreio decisão → destino conferida: nenhuma decisão nomeada na spec sem dono
      permanente
- [ ] A primeira linha da spec vira `Status: fechada em <AAAA-MM-DD> — porquê promovido a <caminhos>`,
      e os caminhos existem
- [ ] O bloco destilado do esforço entra no índice das fases, sob o capítulo da Fase 12
- [ ] O enxugamento da suíte de integração entra no backlog, com o problema que resolve e o tamanho
      estimado — nesta issue não se apaga teste nenhum
- [ ] Se 17 ou 18 tiverem sido cortadas, isso é registrado como decisão, não deixado como metade feita
- [ ] Suíte, `typecheck`, `lint` e `docs:check` verdes, e o PR do esforço para a `dev` com CI verde

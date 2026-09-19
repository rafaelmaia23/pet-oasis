# 12: O web consome o contrato

**What to build:** o web depende de `@pet-oasis/api-contracts` por `workspace:*` e o
`typecheck` dele passa importando um schema de request e uma view de resposta reais (por
exemplo, o schema de login e a view `me`). É o smoke que prova o objetivo da fase: uma mudança
de contrato na API quebra o `typecheck` do web no mesmo PR. Nenhuma tela é construída — isso é
a Fase 12.

**Blocked by:** 11.

**Status:** ready-for-agent

- [ ] `@pet-oasis/api-contracts` nas dependências do web; o Turbo constrói/resolve o contrato
      antes do `typecheck` do web.
- [ ] Um módulo do web importa um schema de request e uma view de resposta do contrato e os usa
      de forma tipada (ao menos um `z.infer` consumido); `typecheck` e `lint` do web verdes.
- [ ] Prova negativa, feita e desfeita no mesmo PR (ou documentada): mudar um campo da view no
      contrato faz o `typecheck` do web falhar.
- [ ] O `next build` do web funciona com o contrato (o pacote é transpilado/resolvido pelo Next
      — `transpilePackages` ou consumo de `dist`, conforme a decisão da issue 09).
- [ ] O CI roda o web afetado por uma mudança no contrato (o `--filter=...[base]` enxerga a
      dependência).
- [ ] A spec da Fase 12 (a do web) ganha uma linha dizendo que os schemas vêm do contrato, não
      de cópia — e a issue dela que planejava o cliente de API é ajustada de acordo.

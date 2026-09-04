# 13: Comprimento máximo em todo campo de texto

**What to build:** um campo de texto para de aceitar 99KB. O limite total de corpo protege o
agregado, mas nada impede quase todo ele dentro de um único campo de nome — o que vira lixo no
banco, índice inchado e, agora que existe log estruturado, linha de log gigante.

**Blocked by:** None. Última da trilha de aplicação **de propósito**: é varredura larga sobre os
schemas, e fazê-la antes conflitaria com qualquer outra edição de schema da fase.

**Status:** ready-for-agent

- [ ] Varredura em todos os schemas, acrescentando limite coerente com a coluna correspondente
      do modelo de dados. Onde a coluna não tem limite declarado, o limite é escolhido e o
      motivo é registrado.
- [ ] A mudança é **aditiva**: acrescentar limite não quebra chamador nenhum, então pousa verde
      de uma vez — não precisa de expand–contract.
- [ ] Teste por schema tocado, afirmando que o campo acima do limite é recusado com o erro de
      validação **por campo** — não um teste-monolito.
- [ ] Documentação de rotas e especificação gerada refletem os limites, que agora são contrato.

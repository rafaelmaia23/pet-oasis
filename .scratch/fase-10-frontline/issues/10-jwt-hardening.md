# 10: Endurecer a verificação do JWT

**What to build:** o token de acesso deixa de estar exposto a *algorithm confusion*, e passa a
ser recusado quando não foi emitido por nós ou não é para nós. Poucas linhas, vulnerabilidade de
manual.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] O algoritmo é fixado na verificação — sem pinar, o token fica exposto a troca de
      algoritmo.
- [ ] Emissor e audiência são definidos na emissão e validados na verificação.
- [ ] Tolerância de desvio de relógio definida explicitamente.
- [ ] Testes afirmando recusa de: token com algoritmo diferente, emissor errado, audiência
      errada. E aceitação do token legítimo, para provar que o endurecimento não quebrou o
      caminho feliz.
- [ ] Consequência registrada: tokens emitidos antes desta mudança não carregam emissor nem
      audiência, então a implantação invalida os que estiverem em voo. Com 15 minutos de vida,
      a janela é curta — mas é preciso dizê-lo em vez de descobrir.

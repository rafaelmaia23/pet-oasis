# 12: As rotas de pet passam ao registrador

**What to build:** as dez rotas de pet passam a sair da entrada da tabela, preservando o modo
fail-closed da autorização (o dono do pet não está na URL).

**Blocked by:** 08, 07.

**Status:** ready-for-agent

- [ ] As 10 rotas migram, **um commit por rota**, cada commit com a suíte verde
- [ ] O caminho fail-closed continua fechado: quem não tem a feature `:others` não descobre a
      existência do pet de outro
- [ ] A ligação do pet ao `Customer` e as regras de raça continuam as mesmas
- [ ] Nenhum status, corpo ou mensagem muda; os testes de integração de pet seguem verdes sem
      alteração

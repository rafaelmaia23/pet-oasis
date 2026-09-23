# 09: As rotas de role, feature e permission passam ao registrador

**What to build:** as onze rotas de autorização — role, feature e permission — deixam de declarar
schema, status e view no controller e passam a sair da entrada da tabela.

**Blocked by:** 08.

**Status:** ready-for-agent

- [ ] As 11 rotas migram, **um commit por rota**, cada commit com a suíte verde
- [ ] Nenhum status, corpo ou mensagem muda: os testes de integração existentes seguem verdes sem
      alteração
- [ ] O guard de feature de cada rota continua o mesmo, agora como parâmetro do registro
- [ ] Os guards de não-escalação de permissão continuam provados pelos testes que já os provam

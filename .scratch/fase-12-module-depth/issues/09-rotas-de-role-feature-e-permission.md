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

**Antes de começar, leia a seção "Duas consequências do registrador, descobertas na issue 08" da
`spec.md`.** A primeira delas — o `authenticate` descendo do prefixo para a rota, e com ele um 401
virando 404 em método inexistente — alcança `/roles`, `/features` e `/users/:userId` desta issue, e
**é decisão do dono do projeto**, não desta issue. Se ela ainda não tiver resposta, pergunte antes
de migrar a primeira rota: reverter depois custa as onze.

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
`spec.md`.** A primeira delas alcança `/roles`, `/features` e `/users/:userId` desta issue: o
`authenticate` desce do prefixo para o `before` da rota, e com isso um método inexistente sob esses
prefixos passa a responder 404 em vez de 401. **Já está decidido** — o dono do projeto escolheu o
404 em 2026-09-23, e o porquê está em
`apps/api/docs/adr/0203-authenticate-desce-do-grupo-para-rota-404-vence-401.md`. Não reabra; o
segundo item do checklist acima ("nenhum status muda") lê-se com essa exceção.

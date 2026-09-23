# 10: As rotas de auth passam ao registrador

**What to build:** as catorze rotas de autenticação — login, refresh, logout, sessões, verificação de
email, recuperação de senha, troca de email, reativação — passam a sair da entrada da tabela. É o
grupo mais sensível: é o que o esforço do web consome primeiro.

**Blocked by:** 08, 04 (o cookie de refresh precisa já ser um módulo antes de o controller de auth
ser reescrito, senão as duas mudanças competem pelo mesmo arquivo).

**Status:** ready-for-agent

- [ ] As 14 rotas migram, **um commit por rota**, cada commit com a suíte verde
- [ ] O cookie de refresh continua sendo emitido, lido e limpo pelo módulo da issue 04 — o
      registrador não aprende sobre cookie
- [ ] `expiresIn` continua na resposta de login e refresh, com o mesmo valor
- [ ] A rota de signup continua com seus dois status de sucesso
- [ ] Nenhum status, corpo ou mensagem muda; os testes de integração de auth seguem verdes sem
      alteração

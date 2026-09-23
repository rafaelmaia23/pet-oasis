# 14: As rotas de product e variant passam ao registrador

**What to build:** as onze rotas de produto, variante e imagem passam a sair da entrada da tabela —
o grupo com a escada de views mais profunda (público, interno, custo) e o único com upload.

**Blocked by:** 08.

**Status:** ready-for-agent

- [ ] As 11 rotas migram, **um commit por rota**, cada commit com a suíte verde
- [ ] A escada de views continua escolhida pela feature efetiva, e o filtro da listagem continua
      coerente com a view escolhida
- [ ] O upload de imagem continua com seu limite de tamanho e seu tipo aceito, agora como parâmetro
      do registro
- [ ] A busca textual com tolerância a erro de digitação continua com a mesma ordem de resultados
- [ ] Nenhum status, corpo ou mensagem muda; os testes de integração seguem verdes sem alteração

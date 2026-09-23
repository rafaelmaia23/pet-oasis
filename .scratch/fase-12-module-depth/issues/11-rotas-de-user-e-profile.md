# 11: As rotas de user e profile passam ao registrador

**What to build:** as catorze rotas de usuário e de perfil (customer e employee) passam a sair da
entrada da tabela, incluindo as que hoje respondem um 422 que o documento não declara.

**Blocked by:** 08, 07 (a primitiva de autorizar-antes-de-buscar toca os mesmos serviços; feita
antes, evita que as duas mudanças disputem o arquivo).

**Status:** ready-for-agent

- [ ] As 14 rotas migram, **um commit por rota**, cada commit com a suíte verde
- [ ] A escada de views de usuário continua escolhida pela feature efetiva de quem pede, com o mesmo
      resultado
- [ ] Ban, lock, reativação e deleção continuam com os mesmos status e o mesmo efeito em sessões
- [ ] O 422 de id inválido continua acontecendo igual — **declarar** isso no documento é da issue 16,
      não desta
- [ ] Nenhum status, corpo ou mensagem muda; os testes de integração seguem verdes sem alteração

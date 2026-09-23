# 13: As rotas de brand, category e tag passam ao registrador

**What to build:** as catorze rotas de marca, categoria (em árvore) e tag passam a sair da entrada da
tabela.

**Blocked by:** 08.

**Status:** ready-for-agent

- [ ] As 14 rotas migram, **um commit por rota**, cada commit com a suíte verde
- [ ] A subárvore de categoria e a unicidade de slug continuam se comportando igual
- [ ] Os resolvedores carrega-ou-404 do catálogo **não** são tocados (fora do escopo, issue 07)
- [ ] Nenhum status, corpo ou mensagem muda; os testes de integração seguem verdes sem alteração

# 08: `code` estável por condição de recusa de login

**What to build:** um cliente distingue por máquina as recusas de login. Hoje as três — conta
banida, troca de senha forçada, conta não verificada — respondem com o mesmo identificador de
erro e diferem **só na prosa em pt-BR**, então a única forma de cumprir a promessa de "mensagem
por condição" seria casar string em português. O front documentou essas recusas como 401 e manda
403 virar toast de erro de programação: a tela de login mostraria o diagnóstico errado
exatamente quando a pessoa mais precisa da instrução certa.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] O identificador de erro passa a ser parametrizável nas factories. Hoje o tipo utilitário
      que elas usam o remove dos parâmetros, fixando-o por subclasse — é essa fixação que
      produz o identificador idêntico nas três.
- [ ] Os identificadores são `ACCOUNT_BANNED`, `PASSWORD_RESET_REQUIRED` e
      `EMAIL_NOT_VERIFIED`.
- [ ] **Os status não mudam.** 403 é correto: a senha já conferiu, então a pessoa está
      autenticada e a *conta* é que está recusada. Mudar para 401 seria quebra de contrato num
      endpoint já documentado em três lugares, em troca de nada.
- [ ] A ordem de avaliação não muda: lockout (429) → banida → senha forçada → não verificada.
- [ ] Credencial errada e email desconhecido continuam **deliberadamente indistinguíveis** entre
      si. Não há vazamento novo nos três identificadores: eles só disparam depois de a senha
      conferir, então quem os recebe é o dono da conta.
- [ ] Teste por condição na fronteira HTTP, afirmando status **e** identificador.
- [ ] Documentação de rotas, especificação gerada e coleção de requisições refletem os
      identificadores.

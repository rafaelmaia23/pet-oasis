# 07: Renovação automática da sessão

**What to build:** a sessão sobrevive à expiração do access token sem que a pessoa perceba.
Ela não é deslogada aos quinze minutos, e não é deslogada por abrir vários links ao mesmo
tempo.

Este é o ticket de maior risco da fatia. A API mata **todas** as sessões do `User` quando um
refresh já consumido reaparece — comportamento correto lá, e que vira falso positivo aqui se
a renovação for concorrente. As três travas do ADR-0001 não são polimento.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] `ensureFreshSession` renova quando faltam **menos de 60 segundos** para o access token
      expirar
- [ ] Chamadas concorrentes para a mesma sessão produzem **uma única** renovação
- [ ] Requisição de **prefetch nunca renova**
- [ ] O `matcher` do middleware exclui estático e imagem
- [ ] Recusa da API na renovação **destrói a sessão** e leva ao login
- [ ] Tudo acima é provado na costura 2, com **relógio injetado**. Nenhum teste espera tempo
      real
- [ ] Um teste ponta a ponta prova que a sessão sobrevive à expiração, encurtando a validade
      do access token pela configuração da API no ambiente de teste
- [ ] O ADR-0001 continua descrevendo o que o código faz. Se a implementação divergir, o ADR é
      atualizado no mesmo ticket

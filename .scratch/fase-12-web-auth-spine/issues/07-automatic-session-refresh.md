# 07: Renovação automática da sessão

**What to build:** a sessão sobrevive à expiração do access token sem que a pessoa perceba.
Ela não é deslogada aos quinze minutos, e não é deslogada por abrir vários links ao mesmo
tempo.

Este é o ticket de maior risco da fatia. A API mata **todas** as sessões do `User` quando um
refresh já consumido reaparece — comportamento correto lá, e que vira falso positivo aqui se
a renovação for concorrente. As três travas do ADR-0001 não são polimento: a janela de graça
de dez segundos da API cobre a corrida que elas não alcançam, e **não** é licença para
renovar em paralelo.

**Blocked by:** 00, 06

**Status:** ready-for-agent

- [ ] `ensureFreshSession` renova quando faltam **menos de 60 segundos** para o access token
      expirar — validade lida da resposta de login/refresh (issue 00), nunca do JWT
- [ ] O par que a API devolve **sobrescreve** o que o módulo tinha: dentro da janela de graça
      ela devolve o par **atual** da corrente, não necessariamente o que aquela rotação emitiu
- [ ] Chamadas concorrentes para a mesma sessão produzem **uma única** renovação
- [ ] Requisição de **prefetch nunca renova**
- [ ] O `matcher` do middleware exclui estático e imagem
- [ ] **Recusa** da API na renovação destrói a sessão e leva ao login
- [ ] Um **503** na renovação **não** destrói a sessão: é retentável, e significa que a API não
      conseguiu reproduzir o par dentro da janela de graça. O primeiro 503 abre uma janela
      própria de **30 segundos** para retentar aquele mesmo token — retentar imediatamente,
      com backoff curto; depois disso a reapresentação vira roubo. Tratá-lo como recusa
      desloga alguém à toa — a distinção entre os dois é provada na costura 2
- [ ] Tudo acima é provado na costura 2, com **relógio injetado**. Nenhum teste espera tempo
      real
- [ ] Um teste ponta a ponta prova que a sessão sobrevive à expiração, encurtando a validade
      do access token pela configuração da API no ambiente de teste (`JWT_EXPIRES_IN`). O
      teste usa um `User` próprio: a API mantém no máximo 5 sessões vivas por usuário, e
      workers paralelos no mesmo usuário do seed derrubariam a sessão que ele afirma
- [ ] O ADR-0001 continua descrevendo o que o código faz. Se a implementação divergir, o ADR é
      atualizado no mesmo ticket

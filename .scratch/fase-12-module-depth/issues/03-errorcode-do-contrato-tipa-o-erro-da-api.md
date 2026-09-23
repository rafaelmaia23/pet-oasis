# 03: O `ErrorCode` do contrato passa a tipar o erro da API

**What to build:** um cliente que ramifica por `code` — o que o esforço do web vai fazer — pode
confiar que o `code` que a API emite pertence ao enum que o contrato publica. Hoje não pode: o
vocabulário de erro tem dois donos que não se conhecem. O contrato declara os codes e o schema do
envelope, e nada em `apps/api` os importa; as classes de erro declaram os seus, `code` é `string`, e
o 409 de violação de unicidade monta o envelope à mão, numa quarta grafia.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] O `code` do erro da API é o tipo do contrato, não `string`: um code fora do enum não compila
- [ ] Cada classe de erro tira o code do contrato, em vez de declarar o seu
- [ ] Os codes que hoje viajam como string nua no fluxo de login entram no enum do contrato
- [ ] O 409 de violação de unicidade passa pelo mesmo caminho de serialização dos outros, sem montar
      o envelope à mão
- [ ] Teste que parseia o corpo serializado de cada erro (inclusive o 409 e o 422 por campo) pelo
      schema de envelope do contrato
- [ ] O único ponto de saída do erro continua único: log, Sentry, `requestId` e headers seguem onde
      estão
- [ ] Comportamento externo idêntico — mesmos status, mesmas mensagens, mesmos campos

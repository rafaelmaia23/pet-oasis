# 08: `code` estável por condição de recusa de login

**What to build:** um cliente distingue por máquina as recusas de login. Hoje as três — conta
banida, troca de senha forçada, conta não verificada — respondem com o mesmo identificador de
erro e diferem **só na prosa em pt-BR**, então a única forma de cumprir a promessa de "mensagem
por condição" seria casar string em português. O front documentou essas recusas como 401 e manda
403 virar toast de erro de programação: a tela de login mostraria o diagnóstico errado
exatamente quando a pessoa mais precisa da instrução certa.

**Blocked by:** None (can start immediately).

**Status:** fechada em 2026-09-14

- [x] O identificador de erro passa a ser parametrizável nas factories. Hoje o tipo utilitário
      que elas usam o remove dos parâmetros, fixando-o por subclasse — é essa fixação que
      produz o identificador idêntico nas três.
- [x] Os identificadores são `ACCOUNT_BANNED`, `PASSWORD_RESET_REQUIRED` e
      `EMAIL_NOT_VERIFIED`.
- [x] **Os status não mudam.** 403 é correto: a senha já conferiu, então a pessoa está
      autenticada e a *conta* é que está recusada. Mudar para 401 seria quebra de contrato num
      endpoint já documentado em três lugares, em troca de nada.
- [x] A ordem de avaliação não muda: lockout (429) → banida → senha forçada → não verificada.
- [x] Credencial errada e email desconhecido continuam **deliberadamente indistinguíveis** entre
      si. Não há vazamento novo nos três identificadores: eles só disparam depois de a senha
      conferir, então quem os recebe é o dono da conta.
- [x] Teste por condição na fronteira HTTP, afirmando status **e** identificador.
- [x] Documentação de rotas, especificação gerada e coleção de requisições refletem os
      identificadores.

## O que foi feito

O tipo utilitário das factories (`OmitFixed`, agora exportado de `AppErrors.ts` e importado pela
factory — antes eram duas cópias editadas em lockstep) deixou de remover o `code`: só o
**status** continua fixo por subclasse, porque é a identidade HTTP dela; o `code` ganhou default
por subclasse, escrito **antes** do spread dos params, e por isso sobrescrevível. O login nomeia
um por condição, e nada mais mudou nele — nem status, nem mensagens, nem ordem.

Testes na fronteira HTTP: um por condição afirmando status **e** `code`; três guardas de ordem
(lockout → banida, banida → senha forçada, senha forçada → não verificada — a primeira era a
única ponta da cadeia sem teste e foi achada na revisão); e a indistinguibilidade de senha errada
e email desconhecido, que era só prosa, virou asserção (mesmo 401, mesmo `code`, mesma mensagem).

Documentação: o OpenAPI do `/auth/login` ganhou descrição da operação com as cinco recusas em
ordem e um 403 próprio que nomeia os três códigos (asserido em `openapi.test.ts`);
`endpoints.md` e a coleção Bruno refletem. O guia de integração já prometia esses códigos ao
front desde a 10.6 — esta issue é a API cumprindo o que o guia dizia. O porquê foi para a decisão
já existente "403 (não 401) no login" em `apps/api/docs/adr/README.md#identidade-e-sessões`, como emenda
narrando a mudança, não como decisão nova.

Fica no backlog, não decidido: o 403 do login descreve os códigos em **prosa**, sem `enum` no
schema — um cliente que gera tipos a partir da spec não ganha o union. Item registrado em
`docs/reference/backlog.md`.

Suíte completa (**1225**), `typecheck`, `lint` e `docs:check` verdes.

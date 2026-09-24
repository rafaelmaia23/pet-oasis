# 03: O `ErrorCode` do contrato passa a tipar o erro da API

**What to build:** um cliente que ramifica por `code` — o que o esforço do web vai fazer — pode
confiar que o `code` que a API emite pertence ao enum que o contrato publica. Hoje não pode: o
vocabulário de erro tem dois donos que não se conhecem. O contrato declara os codes e o schema do
envelope, e nada em `apps/api` os importa; as classes de erro declaram os seus, `code` é `string`, e
o 409 de violação de unicidade monta o envelope à mão, numa quarta grafia.

**Blocked by:** None (can start immediately).

**Status:** fechada em 2026-09-23

- [x] O `code` do erro da API é o tipo do contrato, não `string`: um code fora do enum não compila
- [x] Cada classe de erro tira o code do contrato, em vez de declarar o seu
- [x] Os codes que hoje viajam como string nua no fluxo de login entram no enum do contrato
- [x] O 409 de violação de unicidade passa pelo mesmo caminho de serialização dos outros, sem montar
      o envelope à mão
- [x] Teste que parseia o corpo serializado de cada erro (inclusive o 409 e o 422 por campo) pelo
      schema de envelope do contrato
- [x] O único ponto de saída do erro continua único: log, Sentry, `requestId` e headers seguem onde
      estão
- [x] Comportamento externo idêntico — mesmos status, mesmas mensagens, mesmos campos

## O que ficou

**`AppErrorParams.code` e `AppError.code` são o `ErrorCode` do contrato.** É a mudança que carrega
as outras: as 12 classes continuam digitando o literal (`"NOT_FOUND"`, `"CONFLICT"`…), mas agora o
literal é *verificado* contra `ERROR_CODES` de `@pet-oasis/api-contracts/errors`. Era essa a forma
que `apps/api/docs/adr/0095-fronteira-featurename-string.md` já prescrevia: tipo estreito vale onde
se digita o literal, e é exatamente aqui. O contrato virou a **interface** do vocabulário de erro e
a API a implementação, em vez de duas declarações paralelas.

**Os três codes do login não precisaram entrar no enum — já estavam lá.** `ACCOUNT_BANNED`,
`PASSWORD_RESET_REQUIRED` e `EMAIL_NOT_VERIFIED` são declarados em `ERROR_CODES` desde sempre; o que
faltava era a API tratá-los como tal. Eram "string nua" no sentido de que `createForbiddenError({
code: "ACCOUNT_BANNED" })` compilava com qualquer grafia — um `"ACCOUNT_BANED"` passaria e só
apareceria no cliente. Agora não compila.

**O 409 do `P2002` deixou de montar o envelope à mão.** O handler constrói um `ConflictError` com a
mensagem e a ação que já produzia, e responde com o `toJson()` dele — mesmo nome, mesmo status,
mesmo code, mesma prosa, saindo do mesmo lugar dos outros onze.

**O `respond` do error handler ficou tipado pelo envelope que a API emite** (`AppErrorJson`, novo em
`AppError.ts`). É o que dificulta uma quinta grafia amanhã: um corpo montado à mão teria de
reconstruir o envelope inteiro **e** usar um `code` do enum — `code: "QUALQUER_GRAFIA"` não compila.
O tipo tem duas diferenças deliberadas em relação ao `ErrorResponse` do contrato, e as duas estão
comentadas no código:

- **o `code` é estreitado ao enum.** No contrato ele é `string` aberta *de propósito* (um code novo
  da API não pode fazer o parse do cliente falhar); quem **emite**, porém, não tem essa liberdade.
  A primeira versão desta issue tipava o corpo como `Omit<ErrorResponse, "requestId">` e afirmava
  num comentário que isso impedia a grafia nova — não impedia, porque o `code` de lá é `string`. A
  revisão pegou, e o estreitamento é a correção.
- **o `requestId` fica de fora**, porque quem o acrescenta é o ponto único de saída, que é quem tem
  o contexto do request.

**A prova é `apps/api/tests/unit/contracts/errorEnvelope.test.ts`**, ao lado dos outros dois testes
de paridade com o contrato. Ele serializa cada erro pelo `errorHandler` — o corpo que o cliente de
fato recebe, com `requestId` — e o parseia pelo schema do contrato com `toMatchView`, que é
estrito: campo a mais reprova. A tabela cobre as 11 classes de envelope simples **e** os três 403 de
login (que não têm classe própria, só `code` próprio), mais o 422 por campo
(`validationErrorResponseSchema`) e o 409 do `P2002`, construído a partir de um
`PrismaClientKnownRequestError` de verdade. O último caso é de compile-time: um `@ts-expect-error`
sobre um code inventado, que fica sem erro para suprimir — e reprova o `typecheck` — se `code` algum
dia voltar a ser `string`.

**O que foi deliberadamente deixado de fora.** `ValidationErrorFields` continua declarado na API,
embora o contrato tenha o mesmo tipo (`validationErrorFieldsSchema`): unificar os dois é mudança de
fronteira que nem a issue nem a spec pediram, e "o que é contrato e o que fica no app" não se decide
de passagem. O par `(status, code default)` também continua redigitado nas 12 subclasses — o status
é a identidade HTTP da classe, como o comentário do arquivo já dizia, e trocá-lo por um mapa é outro
trabalho.

**Comportamento externo:** nada mudou. Os 1395 testes da API (80 arquivos, incluindo a suíte de
integração inteira) passam sem edição — nenhum teste de integração foi tocado, como a spec exige.

# Login e refresh anunciam `expiresIn`, em segundos, derivado do `JWT_EXPIRES_IN` (11.16)

> Decisão da Fase 11 (issue 16), registrada em 2026-09-21. Nasceu da issue `00` da Fase 12
> (`.scratch/fase-12-web-auth-spine/issues/00-api-side-prerequisites.md`): o guia de integração
> proibia o cliente de decodificar o JWT, mas não lhe dava outro jeito de saber quando o access
> token expira. Contexto de execução em
> `.scratch/fase-11-monorepo/issues/16-session-response-with-expires-in.md`.

`POST /auth/login` e `POST /auth/refresh` respondem `{ accessToken, expiresIn }`, e a view
(`accessTokenViews`, id `AccessToken` no OpenAPI) é do contrato `@pet-oasis/api-contracts`, no
domínio `auth` — antes o schema morava só em `src/docs/paths/auth.ts`, e o web não teria de onde
tipar a resposta do login. `expiresIn` é a validade em **segundos inteiros, contada do
recebimento** (convenção OAuth2). O cliente lê a expiração **daí**, nunca do `exp` do JWT nem de
uma cópia do `JWT_EXPIRES_IN`: os dois são configuração da API e podem mudar sem aviso.

Três escolhas:

**Prazo relativo, não instante absoluto.** `expiresAt` (um timestamp) foi rejeitado porque
depende de o relógio do BFF concordar com o da API; um número de segundos contado do recebimento
não depende de relógio nenhum. O preço é uma imprecisão de latência de rede, que a margem de
renovação do cliente (60 s antes, pelo guia) engole com folga.

**Uma configuração só.** `JWT_EXPIRES_IN` continua sendo a string que sempre foi (`"15m"`), e o
número anunciado sai dela em `src/lib/accessToken.ts` (`ACCESS_TOKEN_TTL_SECONDS`), lido pelo
**mesmo** parser (`ms`, que virou dependência direta) e com o mesmo `Math.floor` que o
`jsonwebtoken` aplica ao gravar o `exp`. Não existe segunda constante para desalinhar; o teste
unitário prova `expiresIn === exp − iat` do token recém-assinado, e o HTTP prova o mesmo na
borda. O **formato** é conferido no limite do env (`timespanSchema`, em `src/config/env.ts`),
junto de todas as outras restrições de boot e com a mesma mensagem de recusa: uma string que o
parser não entende derruba o processo, em vez de quebrar no primeiro login, e quem lê
`env.JWT_EXPIRES_IN` recebe o tipo já estreitado — nenhum consumidor precisa de `as`. A revisão
da issue derrubou a versão anterior, em que a guarda vivia na `lib` como efeito de import: era
um segundo sítio de falha de boot, com formato de erro próprio.

**O TTL configurado, não `exp − agora`.** O par que a janela de graça replica
([`0057`](0057-janela-graca-10s-rotacao.md)) já pode ter alguns segundos de vida, e mesmo assim
anuncia o mesmo `expiresIn` do par emitido: o número é o TTL, montado no controller a partir da
constante, e não uma conta sobre o token. Reduzir o valor no replay obrigaria o controller a
decodificar o próprio token para servir a resposta, e a diferença máxima (10 s da janela) cabe
na margem de 60 s do cliente.

# 04: O cookie de refresh vira um módulo de três operações

**What to build:** as propriedades de segurança do cookie de sessão passam a ser decididas num lugar
só, e testáveis. Hoje a política vive em quatro expressões do controller de auth — dois blocos de
seis atributos idênticos, três leituras com cast, um `clearCookie` com o path repetido — e é
afirmada por um único teste, no login. Na prática: o refresh pode perder `httpOnly` ou `sameSite` e
a suíte fica verde, e `secure` em produção não é alcançado por nenhum teste.

**Blocked by:** None (can start immediately).

**Status:** fechada em 2026-09-23

- [x] Um módulo com três operações — emitir o cookie numa resposta, ler da requisição, limpar — dono
      dos atributos e do path (`apps/api/src/modules/auth/auth.refreshCookie.ts`)
- [x] O controller de auth para de conhecer o ambiente, o TTL e o cast do jar de cookies — o import
      de `@/config/env` saiu do arquivo
- [x] `set` e `clear` usam o mesmo path por construção, não por dois literais iguais: os dois saem
      de `refreshCookiePolicy()`, e um teste afirma a igualdade
- [x] Teste unitário contra uma resposta falsa cobrindo os atributos por ambiente, **incluindo**
      `secure` em produção (`apps/api/tests/unit/modules/auth/auth.refreshCookie.test.ts`, 15 casos)
- [x] Os testes de integração de login, refresh, logout e listagem de sessões seguem verdes, sem
      alteração — `tests/integration/v1/auth.test.ts`, 163 casos, arquivo não tocado
- [x] O cabeçalho do módulo registra que o BFF do web espelha esta política (esforço
      `fase-12-web-auth-spine`), para que as duas não divirjam

## O que ficou

**A interface é de três operações e não conhece Express.** `setRefreshCookie(res, token)`,
`readRefreshCookie(req)` e `clearRefreshCookie(res)` pedem só o jar — dois tipos estruturais
(`RefreshCookieResponse`, `RefreshCookieRequest`) que o `Response`/`Request` do Express satisfazem
sem cast e que uma resposta falsa satisfaz sem subir HTTP. Foi isso que tornou a política
alcançável por teste unitário: a suíte de integração roda em `NODE_ENV=test`, onde `secure` é falso
por definição, e nenhum teste dela poderia provar produção.

**O ambiente é lido a cada chamada, não no import.** `refreshCookiePolicy()` é função, não
constante: além de ser o que permite ao teste variar `NODE_ENV`, é o que impede o módulo de guardar
uma cópia de uma decisão que o processo já tomou em `env`.

**`maxAge` ficou fora da política compartilhada, e o `clear` manda só o `path`.** A política são os
atributos que protegem e endereçam o cookie (`httpOnly`, `sameSite`, `secure`, `path`); o prazo
entra só no `set`, porque limpar não tem prazo. A primeira versão fazia o `clear` mandar a política
inteira — o que teria mudado os bytes do `Set-Cookie` do logout sem mudar nada no navegador (quem
identifica o cookie a apagar é a tripla nome/domínio/path). A revisão do eixo Spec pegou isso:
mudança de comportamento externo não é desta issue, e a suíte não a teria pego, porque o teste de
logout só afirma o `Expires` de 1970.

**A leitura deixou de ser um cast.** `req.cookies[NAME] as string | undefined` prometia um tipo sem
verificar nada, e o valor vem do cliente: o `cookie-parser` devolve **objeto** quando o valor chega
com o prefixo `j:`. Agora o tipo é conferido e o que não for texto é tratado como ausência — quatro
casos no teste. É a **única** diferença de comportamento da issue, e ela é numa borda que hoje
terminava em 500: um valor não-textual descia até o hash do token; agora vira 401 (refresh) ou 204
(logout), que é o mesmo que a ausência do cookie já produzia.

**Fora dessa borda, nada mudou**, e a prova é a suíte de integração de auth intacta e verde (163
casos). Nenhum ADR novo: a spec do esforço já registrou que o cookie completa decisões existentes
(`apps/api/docs/adr/0055-design-session-access-jwt-15min-refresh-opaco-rotativo.md`) em vez de abrir
uma nova.

# 10: As rotas de auth passam ao registrador

**What to build:** as catorze rotas de autenticação — login, refresh, logout, sessões, verificação de
email, recuperação de senha, troca de email, reativação — passam a sair da entrada da tabela. É o
grupo mais sensível: é o que o esforço do web consome primeiro.

**Blocked by:** 08, 04 (o cookie de refresh precisa já ser um módulo antes de o controller de auth
ser reescrito, senão as duas mudanças competem pelo mesmo arquivo).

**Status:** fechada em 2026-09-23

- [x] As 14 rotas migraram, **um commit por rota**, cada commit com a suíte verde (87 arquivos,
      1506 testes)
- [x] O cookie de refresh continua sendo emitido, lido e limpo pelo módulo da issue 04 — o
      registrador não aprendeu sobre cookie
- [x] `expiresIn` continua na resposta de login e refresh, com o mesmo valor
- [x] A rota de signup continua com seus dois status de sucesso
- [x] Nenhum status, corpo ou mensagem mudou; os testes de integração de auth seguem verdes sem
      alteração (`tests/integration/v1/auth.test.ts`, 163 casos, arquivo não tocado)

## O que ficou

**O registrador ganhou as duas formas que o grupo piloto não precisou**, e as duas valem das issues
11 em diante — por isso estão anotadas na `spec.md` ("Duas formas que o registrador ganhou na issue
10"), e não só aqui. A interface fixada na spec continua valendo: as duas são acréscimos opcionais,
e uma rota que não precise delas se registra exatamente como antes.

- **`context`, o seam do transporte.** Quatro das catorze rotas precisam de coisas que a tabela não
  descreve e que o handler não pode ir buscar: o refresh token apresentado, o poder de emitir e de
  limpar o dele, o user agent e o IP de quem chamou. O registrador ganhou **um campo opcional** —
  uma função nomeada do módulo, `(req, res) => C`, cujo retorno ele espalha no contexto do handler.
  Ele não aprendeu o que é cookie, user agent nem IP: carrega um `C` opaco. O módulo de auth
  embrulha os quatro em `src/modules/auth/auth.transport.ts`, e o handler vê só
  `presentedRefreshToken`, `issueRefreshToken`, `clearRefreshToken` e `client` — nunca `res`. Esse
  é o **único** ponto do caminho da rota que alcança `auth.refreshCookie.ts`.

`login` declara o transporte por causa do `client` e do `issueRefreshToken`; o
`presentedRefreshToken` fica sem uso ali, e lê-lo é um `typeof` sobre um objeto já parseado pelo
`cookie-parser` — a spec põe otimização fora do escopo, e partir a interface em duas para poupar
isso custaria mais do que paga.
- **O desfecho etiquetado**, que a issue 08 deixou em aberto ("quem escolhe entre eles é o handler,
  e isso ainda não tem forma"). Onde a entrada declara um status só, nada muda. Onde declara mais
  de um, o handler devolve `{ status, body }`, com o corpo exigido exatamente nos status que têm
  view; um status que a entrada não declara é 500 de apresentação, não 422 — o request estava
  certo. É `POST /auth/signup` (201/202), e a recusa no registro que a issue 08 tinha posto ali
  saiu. A da view em escada continua, até a issue 17.

**As duas alternativas recusadas, porque a escolha foi do dono do projeto (2026-09-23):**
`req`/`res` crus no contexto do handler — um escape hatch geral, que deixaria qualquer handler
responder por fora do status e da view da tabela — e um `after(res, result)` que emitisse o cookie
a partir do retorno do handler, que faria um refresh token cru viajar no valor de retorno, com só a
whitelist da view impedindo-o de sair na resposta. A terceira, partir `signup` em duas entradas da
tabela, mudaria o `/openapi.json` e quebraria a paridade de rotas — duas entradas para o mesmo
método + path.

**O `context` é uma função nomeada, não um arrow inline.** Um arrow cujos parâmetros o registrador
teria de tipar é *context-sensitive*, e o TypeScript só o resolve depois de já ter fixado o contexto
do handler: o handler receberia o contexto vazio, com erro de compilação no destructuring. Está
registrado no JSDoc de `RouteRegistration.context` e no guia, porque é o tipo de coisa que custa
meia hora a quem tropeça nela.

**A ordem em que o registrador chama o `context`** é depois do `before` e depois do parse do
envelope — um 422 ou um 429 não constrói o transporte, e portanto não toca o jar de cookies. Dois
casos unitários provam cada um.

**Dois presenters saíram.** `sessionPresenter` e `accessTokenPresenter` eram só
`createPresenter(views)` e ficaram sem chamador quando a view passou a vir da tabela; com os dois
fora, `src/modules/auth/auth.presenter.ts` foi apagado. É a mesma consequência que a spec já
anotara na issue 08 — o mecanismo de whitelist que o
`apps/api/docs/adr/0199-schemas-de-request-e-views-sao-codigo-do-contrato.md` fixou continua
inteiro, em `presentWith`. O que **não** saiu foi a função que carrega uma decisão: o corpo do
access token (`accessTokenBody`) ficou, porque o que ela guarda é o porquê de `expiresIn` ser o TTL
configurado e não `exp - agora`.

**Nenhuma mudança de comportamento, nem a do 401→404.** O `authenticate` de `/auth` já era
por-rota, nunca esteve no prefixo, então a consequência que a spec anotou para os prefixos
autenticados não alcança este grupo. `/auth` deixou de ser prefixo de montagem quando a última
rota migrou.

**Testes:** 9 casos novos no registrador (4 do desfecho etiquetado, 5 do `context`) e 8 em
`tests/unit/modules/auth/auth.transport.test.ts`, contra `req`/`res` falsos. Um caso unitário
**saiu** — o que afirmava a recusa de registro de mais de um status de sucesso, que é exatamente a
recusa que esta issue tinha a tarefa de remover; os 4 do desfecho etiquetado o substituem. A regra
dura da spec ("nenhum teste de integração é apagado") continua intacta: a prova de não-regressão é
`tests/integration/v1/auth.test.ts`, 163 casos, arquivo não tocado.

A documentação acompanhou: `apps/api/docs/guides/documenting-endpoints.md` §3 ganhou o `context` e
o desfecho etiquetado, e o `apps/api/CLAUDE.md` passou a nomear o `context` na descrição da camada
de rota. **Nenhum ADR novo**: a spec põe o "o route entry constrói o handler" no fecho do esforço
(issue 19), e estas duas formas são dele.

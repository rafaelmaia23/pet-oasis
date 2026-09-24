# 09: As rotas de role, feature e permission passam ao registrador

**What to build:** as onze rotas de autorização — role, feature e permission — deixam de declarar
schema, status e view no controller e passam a sair da entrada da tabela.

**Blocked by:** 08.

**Status:** fechada em 2026-09-23

- [x] As 11 rotas migraram, **um commit por rota**, cada um com a suíte inteira verde (86 arquivos,
      1490 testes): `GET /roles`, `GET /roles/:id`, `GET /features`, `GET /features/:id`,
      `GET /users/:userId/features`, `GET /users/:userId/roles`, `GET /users/:userId/permissions`,
      `POST /users/:userId/roles/:roleId`, `DELETE /users/:userId/roles/:roleId`,
      `PUT /users/:userId/roles/:roleId/features/:featureId` e o `DELETE` no mesmo path
- [x] Nenhum status, corpo ou mensagem mudou: os testes de integração de role, feature e permission
      seguem verdes **sem alteração**, e nenhum teste foi apagado, acrescentado ou editado nesta
      issue
- [x] O guard de feature de cada rota é o mesmo que era — `read:role`, `read:feature`,
      `read:permission`, `manage:permission` —, agora como `before: [authenticate, canAccess(…)]`
- [x] Os guards de não-escalação de permissão continuam onde estavam, no serviço:
      `permission.service.ts` e `permission.repository.ts` não foram tocados, e são os mesmos testes
      que os provam

**Como a migração parcial ficou verde a cada commit.** Os três módulos têm mais de uma rota, e o
registrador exige o router montado **sem prefixo** (o path inteiro vem da tabela). Em vez de um
segundo router transitório, o primeiro commit de cada módulo move o mount e faz o que ainda não
migrou **soletrar o path inteiro** e carregar o `authenticate` explícito; os commits seguintes
trocam uma declaração por um `registerRoute`. Assim o repo nunca teve dois routers por módulo, e o
último commit de cada um só apaga a última linha da forma antiga. O `mergeParams: true` do
`permissionRouter` saiu no mesmo movimento: ele existia para que o `:userId` do prefixo
`/users/:userId` chegasse ao handler, e o parâmetro passou a ser da própria rota.

**Três presenters saíram, e nenhum mecanismo foi tocado.** `role.presenter.ts`,
`feature.presenter.ts` e `permission.presenter.ts` eram só `createPresenter(views)` e ficaram sem
chamador quando a view passou a vir da tabela — a mesma consequência que a `spec.md` registra em
"Presenter que fica sem chamador sai", e que já tinha levado os de breed e de me no piloto. A
whitelist continua inteira, no `presentWith`. O `rolePresenter` foi o último a cair, porque o
controller de permission o importava do módulo vizinho para apresentar role em duas rotas: as duas
agora leem a mesma `roleViews.default` da tabela, e o import entre módulos deixou de existir.

**O 401→404 do ADR 0203 é mais estreito do que estava escrito — medido aqui, decisão intacta.**
`authenticate` só responde 401 com token **inválido**; sem header `Authorization` ele trata como
anônimo e passa, e o 401 de "sem token" vem do `canAccess`, que é da rota. Então método inexistente
sob prefixo autenticado **já respondia 404** quando não havia header, antes e depois. O que muda de
401 para 404 é o mesmo request **com token inválido** — medido em `POST /roles` e `POST /features`.
Nenhum teste da suíte alcança o caso, e é por isso que ele não apareceu na issue 08. A precisão foi
anotada na seção "Duas consequências do registrador" da `spec.md`, que é onde as issues 10–15 a
encontram; **o ADR 0203 ainda descreve a premissa larga** e pede uma linha de correção do dono —
a decisão (fica o 404) não é afetada.

**Para `/users/:userId` a consequência ainda não chegou**, e não é dívida desta issue:
`v1Router.use("/users/:userId", authenticate, userProfileRouter)` continua montado, então é ele que
responde pelo prefixo. Cai na issue 11, com o resto de user e profile.

**A revisão de dois eixos (`code-review`) apontou seis coisas; três viraram mudança aqui e três
ganharam dono adiante.** O comentário de `src/routes/index.ts` que explicava o `authenticate`
descendo do prefixo estava ancorado só no `logRouter`, quando já são oito routers secos: subiu para
o bloco das protegidas e passou a citar o ADR 0203. O comentário que eu havia escrito no
`permission.controller.ts` afirmava um porquê que ninguém decidiu ("coleção pequena por
construção") e encolheu para a citação do `apps/api/docs/adr/0004-pagination.md`, como
em breed. As duas frases de `apps/api/CLAUDE.md` que a migração tornou falsas —
`*.presenter.ts` em todo módulo, e validação sintática "no controller" — ganharam um
checkbox na **issue 15**, que é onde elas passam
a ser falsas para todas as rotas. E dois achados de desenho que esta issue conscientemente não
tomou foram para `docs/reference/backlog.md`, seção *Arquitetura e fronteiras*: a tripla
`(user, role, feature)` viajando como três strings posicionais em três camadas, e o descompasso
entre `getUserPermissions` e `listEffectiveFeatures`.

**Nenhum ADR novo.** Esta issue não decidiu nada: consumiu o registrador da 08 e a decisão do 0203.
O ADR "o route entry constrói o handler" é do fecho do esforço (issue 19).

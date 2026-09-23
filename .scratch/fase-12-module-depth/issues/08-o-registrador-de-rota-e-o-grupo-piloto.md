# 08: O registrador de rota, com o grupo piloto (expand)

**What to build:** uma rota passa a ser declarada **num lugar só**. Hoje são três: a entrada da
tabela do contrato declara método, path, request, resposta e erros; o router declara método, path e
guard; e o controller re-declara o schema, o status e a view. Só método e path são vigiados, e por um
teste que faz monkey-patch do router do Express. Esta issue **acrescenta** o registrador ao lado da
forma antiga (expand) e migra o primeiro grupo de rotas: status, `me`, log, audit-log e breed — cinco
rotas, as menores e só de leitura.

A interface do registrador foi fixada na spec porque as seis issues de rota seguintes dependem dela,
e é a única desta issue que não se decide aqui:

```ts
registerRoute(router, routes.user.unban, {
  before: [authenticate, canAccess("manage:user:status")],
  handler: async ({ params, body, query, actor }) => { /* devolve o que a view descreve, ou void */ },
});
```

**Blocked by:** 02 (a tabela precisa ter `path` literal e invariantes provados antes de virar fonte
do registro).

**Status:** fechada em 2026-09-23

O que de fato ficou pronto — onde divergiu do plano, o porquê está ao lado:

- [x] O registrador (`apps/api/src/lib/registerRoute.ts`) deriva da entrada: path, método, parse do
      envelope, status de sucesso e a view aplicada à resposta. Fica em `src/lib/` porque não conhece
      módulo nenhum (`apps/api/docs/adr/0100-src-lib-nao-conhece-modulo-nenhum.md`).
- [x] O handler recebe `{ body, params, query, actor }` já validado e devolve dado (ou nada, no 204).
      Não toca `res`. O contexto **espalha o envelope parseado**, então `params`/`body`/`query`
      existem exatamente onde a entrada os declara, e o `actor` é obrigatório (`AuthUser`) onde a
      tabela diz `auth: "bearer"` e opcional onde diz `"public"` — derivado do `auth`, não do
      call site.
- [x] O que é de servidor entra por `before`, na ordem em que já roda. As cinco rotas exercitaram
      três desses: `authenticate`, `canAccess` e `rateLimitByIp` (o de upload chega nas issues de
      produto). A tabela não os conhece.
- [x] As cinco rotas migraram, **um commit por rota**, cada um com a suíte inteira verde (84
      arquivos, 1446 testes): `GET /status`, `GET /breeds`, `GET /logs/recent`, `GET /me`,
      `GET /audit-logs`.
- [x] A forma antiga continua para as outras 74 rotas. As duas convivem em `src/routes/index.ts`:
      router **sem prefixo** é o que já migrou (o path inteiro vem da tabela), router com prefixo é
      o que falta.
- [x] `apps/api/tests/unit/lib/registerRoute.test.ts`: 16 casos sobre entradas de tabela
      **inventadas no próprio teste** e handlers falsos, num `express()` mínimo com o error handler
      de verdade. Usar `routes.me.get` ali faria o teste falhar quando a rota mudasse — estaria
      provando a rota, não o registrador. Prova método/path, status derivado, 204 sem corpo, parse
      do envelope (incluindo o 422 que não chega ao handler), o ator nos dois modos, a whitelist da
      view, o 500 de apresentação, a ordem do `before` e o erro do handler indo ao error handler.
- [x] Os testes de integração das cinco rotas seguem verdes, sem alteração. Nenhum teste foi
      apagado.

**Três decisões que a issue teve de tomar, e que valem para as seis issues de rota seguintes:**

- **O tipo do retorno do handler não deriva da view.** A primeira versão exigia `z.input<view>` e
  bateu na fronteira do `apps/api/docs/adr/0095-fronteira-featurename-string.md` já na quarta rota:
  `authUser.features` é `string[]` (vem do banco) e a view as declara como união literal — a view é
  um **parser**, é ela que estreita. Exigir a entrada dela no retorno obrigaria o serviço a afirmar
  a união antes do parse, que é o `as` que o ADR decidiu evitar, em toda rota que devolve feature.
  O tipo do handler afirma só **se o status de sucesso tem corpo** (o que faz `async () => {}` ser a
  forma certa do 204 e ser recusada em qualquer outra rota); a forma da resposta continua conferida
  em runtime pela view, como sempre foi com `present(data: unknown, …)`.
- **A whitelist ganhou um dono compartilhado.** `presentWith` saiu de dentro de `createPresenter`
  (`apps/api/src/utils/presenter.ts`) e os dois passaram a usá-lo. Sem isso o registrador deixaria
  escapar um `ZodError` cru da view, e o error handler o leria como erro de validação **do request**:
  422 onde o request estava certo e quem desmentiu o contrato foi a resposta. O helper de whitelist
  que o 0199 chamou de deep é exatamente este — ele não mudou, só passou a ter dois chamadores.
- **Duas formas de entrada são recusadas no registro**, na carga do módulo e com o par método + path
  na mensagem: mais de um status de sucesso (é `POST /auth/signup`, 201/202 — quem escolhe é o
  handler, e isso ganha forma na issue 10) e a `view` em escada (a escolha do degrau só ganha dono
  na issue 17). Falhar no registro, e não no primeiro request, é o que faz a issue seguinte
  encontrar o limite em vez de um 500 em produção.

**Duas mudanças de comportamento, nenhuma alcançável por teste ou por uso real:**

- **Método inexistente sob um prefixo autenticado passa de 401 para 404.** O `authenticate` estava
  montado no prefixo (`v1Router.use("/me", authenticate, meRouter)`) e autenticava tudo que caísse
  ali, inclusive o que não é rota; agora só a rota declarada autentica. Vale para `/me`, `/logs` e
  `/audit-logs`. Nenhum teste cobria o caso, e 404 é o que o Express já responde a qualquer outro
  path desconhecido.
- **`GET /status` sem a versão do banco passa de 200 incompleto para 500.** A rota não tinha
  presenter, então um `SHOW server_version` sem linha saía como resposta sem o campo; com a view
  aplicada isso vira 500 de qualquer jeito, e o `firstRow` só dá ao 500 uma mensagem que nomeia o
  campo. Numa conexão viva o `$queryRaw` lança antes.

**Dois presenters saíram e um encolheu.** `breed.presenter.ts` e `me.presenter.ts` eram só
`createPresenter(views)` e ficaram sem chamador quando a view passou a vir da tabela;
`audit-log.presenter.ts` perdeu o `createPresenter` e guardou o `maskIp`, que nunca foi forma de
resposta — é a decisão de **quem vê o quê**, que continua sendo da API. É a linha que o esforço
desenha: a tabela descreve a forma, a API decide o conteúdo. O *Out of Scope* da spec ("os 13
`*.presenter.ts` não são tocados") foi lido como a proibição de mexer no **mecanismo** de whitelist
que o 0199 fixou — esse continua inteiro, agora em `presentWith`; apagar arquivo que ficou sem
chamador é consequência da migração, não refactor do mecanismo. Restam 10 presenters, nas rotas que
ainda não migraram.

**Um achado, registrado e não resolvido aqui:** `Role.description` é `String?` no banco e
`z.string()` na view (`roleSummaryView`), então uma role sem descrição é 500 e não campo ausente. É
inalcançável — roles são read-only e semeadas sempre com descrição —, e escolher entre migration,
`.nullable()` na view ou "resíduo de schema" é decisão de contrato. Foi para
`docs/reference/backlog.md`, seção *Bugs*.

A documentação acompanhou: `apps/api/docs/guides/documenting-endpoints.md` ganhou a seção
"3. Registrar a rota na API — `registerRoute`" (e o aviso de que rota nova nasce nele), e o
`apps/api/CLAUDE.md` passou a descrever a camada de rota pelo registrador. **Nenhum ADR novo aqui**:
a spec põe o "o route entry constrói o handler" no **fecho** do esforço (issue 19), e o que esta
issue fez foi honrar o `docs/adr/0003-route-table-is-contract-openapi-is-derived.md` — a tabela
finalmente ganhou o segundo adaptador que ele já implicava.

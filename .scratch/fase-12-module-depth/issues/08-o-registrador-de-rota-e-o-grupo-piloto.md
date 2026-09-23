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

**Status:** ready-for-agent

- [ ] O registrador deriva da entrada da tabela: path, parse do envelope, status de sucesso e a view
      aplicada à resposta
- [ ] O handler recebe o envelope já validado e devolve dado (ou nada, no 204) — não toca a resposta
      do Express
- [ ] O que é de servidor entra por parâmetro, na ordem em que já roda: autenticação, guard de
      feature, rate limit por IP, upload de imagem. A tabela não os conhece
- [ ] As cinco rotas do grupo piloto migram, **um commit por rota**, cada commit com a suíte verde
- [ ] A forma antiga continua funcionando para as outras 74 rotas (expand, não big-bang)
- [ ] Teste do registrador pela própria interface: uma entrada de tabela e um handler falso provam
      parse, status e view sem subir a aplicação
- [ ] Os testes de integração das cinco rotas seguem verdes, sem alteração

# 11: As rotas de user e profile passam ao registrador

**What to build:** as catorze rotas de usuário e de perfil (customer e employee) passam a sair da
entrada da tabela, incluindo as que hoje respondem um 422 que o documento não declara.

**Blocked by:** 08, 07 (a primitiva de autorizar-antes-de-buscar toca os mesmos serviços; feita
antes, evita que as duas mudanças disputem o arquivo).

**Status:** fechada em 2026-09-23

O que de fato ficou pronto — onde divergiu do plano, o porquê está ao lado:

- [x] As 14 rotas migraram, **um commit por rota**, cada um com a suíte inteira verde (86 arquivos,
      1494 testes). Dez de usuário (`POST /users`, `GET /users`, `GET /users/:id`,
      `PATCH /users/:id`, `DELETE /users/:id`, `POST` e `DELETE /users/:id/ban`,
      `DELETE /users/:id/lock`, `POST /users/:id/reactivate`,
      `POST /users/:id/force-password-reset`) e quatro de perfil (`POST` e `DELETE` de
      `/users/:userId/customer` e `/users/:userId/employee`).
- [x] A escada de views de usuário continua escolhida pela feature efetiva de quem pede, com o
      mesmo resultado — e agora num lugar só: `chooseUserView`
      (`apps/api/src/modules/user/user.view-resolver.ts`). `resolveUserView`, que respondia pelo
      **nome** da view, perdeu o último chamador com a última rota e saiu.
- [x] Ban, lock, reativação e deleção continuam com os mesmos status e o mesmo efeito em sessões:
      nenhum serviço foi tocado, e os testes de integração que os provam seguem verdes sem
      alteração.
- [x] O 422 de id inválido continua acontecendo igual — o parse do envelope que o produz só mudou
      de lugar, do controller para o registrador. Declará-lo no documento é a issue 16.
- [x] Nenhum status, corpo ou mensagem mudou; nenhum arquivo de `tests/integration/` foi alterado.

**A decisão que a issue teve de tomar, e que alcança as issues 12–14 e 17:** o registrador
**recusava** a entrada cuja `view` é a escada de capability, e cinco das catorze rotas respondem com
`userViewLadder` — a recusa era o bloqueio da issue inteira. O registro ganhou uma terceira chave,
`chooseView`: a tabela declara a escada, o registro diz qual degrau cada ator recebe, e a decisão
continua na API, como o `apps/api/docs/adr/0199-schemas-de-request-e-views-sao-codigo-do-contrato.md`
fixou. **É uma extensão da única interface que a `spec.md` tinha declarado fixa**, feita dentro de
uma issue de migração; está anotada na `spec.md` (seção "Uma terceira consequência, descoberta na
issue 11") e na issue 17 — e não só aqui —, porque é lá que as issues seguintes a encontram. A
issue 17 continua sendo quem dá um dono à correspondência degrau → feature; o que ela encontra
agora é um ponto de leitura só, em vez de quatro camadas diferentes.

**O 401 → 404 do prefixo aconteceu como previsto, e num recorte menor do que parece.** `/users` e
`/users/:userId` perderam o `authenticate` do prefixo, então um método inexistente num path que só
estas rotas cobriam (`/users`, `/users/:id/ban`, `/users/:id/lock`) responde 404 onde respondia 401
— decidido pelo dono do projeto e registrado em
`apps/api/docs/adr/0203-authenticate-desce-do-grupo-para-rota-404-vence-401.md`. `/users/:id` em si
**continua respondendo 401**: o router de permissão ainda está montado em `/users/:userId` com
`authenticate`, e a mudança chega ali quando a issue 09 migrar.

**Dois routers por módulo enquanto a migração de um grupo corre.** Uma rota por commit, num módulo
de dez rotas, exige que as duas formas convivam **dentro do módulo**: o router registrado, montado
sem prefixo, e um `*LegacyRouter` com o que falta, ainda sob o prefixo. O legacy sai no commit da
última rota, junto com a montagem dele. É o que torna "um commit por rota, suíte verde" literal em
vez de aproximado.

**A revisão (`code-review`, eixos Standards e Spec) não achou violação dura de padrão e apontou
duas coisas que valiam conserto, ambas no mesmo ponto.** O `chooseView` devolvia `z.ZodType`, então
a única barreira entre uma view errada e um 500 era a checagem em runtime — o oposto do princípio
que a issue 08 fixou ("falhar no registro, e não no primeiro request"). Como a tabela é escrita com
`as const`, a tupla de degraus sobrevive ao typecheck: o retorno do `chooseView` passou a ser a
**união dos degraus que aquela entrada declara**, e com isso uma view de fora da escada não compila
— nem `chooseView` numa entrada sem escada, onde o tipo é `never`. A comparação por identidade
ficou, porque pega o que o tipo não pega (duas views estruturalmente iguais são o mesmo tipo para o
TS), e o teste dela passou a usar um **gêmeo estrutural** de um degrau declarado em vez de um schema
estranho. A revisão também acusou dois erros factuais nas mensagens de commit (cinco rotas de
escada, não seis; o 404 valendo para menos paths do que a mensagem dizia), corrigidos na própria
branch antes do merge.

A documentação acompanhou: `apps/api/docs/guides/documenting-endpoints.md` §3 ganhou o `chooseView`
— como se escreve, o que o tipo garante e o que a identidade garante. **Nenhum ADR novo aqui**: a
fronteira do 0199 não se moveu, e o ADR da escada é o primeiro passo da issue 17.

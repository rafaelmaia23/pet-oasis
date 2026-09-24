# 16: A lista de erros passa a ser derivada, e o documento não pode sub-declarar

**What to build:** quem lê o `/openapi.json` passa a ver os status que a API de fato responde. Hoje
não vê: catorze rotas com parâmetro respondem 422 a um id inválido e não declaram esse 422 — e a
própria suíte de integração exige o 422 em algumas delas. A prova de que a lista é mantida à mão está
em duas rotas do mesmo path, uma declarando o 422 e a outra não.

Esta é a **única mudança visível para fora** de todo o esforço, e por isso fica num commit próprio e
anunciado: nenhum comportamento muda, apenas a documentação passa a dizer a verdade.

**Blocked by:** 15 (o guard só vale para as 79 rotas quando todas estiverem sob o registrador).

**Status:** fechada em 2026-09-24

O que de fato ficou pronto:

- [x] A lista de erros de uma rota é **derivada** do que o schema de request e os middlewares podem
      produzir, em vez de escrita à mão em cada entrada — não na tabela do contrato (`errors` não é
      lido por `registerRoute`, só pelo `/openapi.json`), e sim no único lugar que traduz a tabela
      para o documento: `derivedErrors` em `apps/api/src/docs/adapter.ts`, computada a partir de
      `auth === "bearer"` (401, `getAuthUser`) e `request` presente (422, o `.parse()` do envelope).
      `toOperation` mescla `{ ...derivedErrors(route), ...route.errors }` — o que a rota declara à
      mão continua vencendo em conflito, mas os dois status estruturalmente garantidos não dependem
      mais de ninguém lembrar de digitá-los.
- [x] Um teste proíbe o documento de sub-declarar um status alcançável —
      `apps/api/tests/unit/docs/adapter.test.ts`, puro (sem banco, roda contra
      `buildPathsFromRouteTable()`): toda rota bearer declara 401, toda rota com `request` declara
      422, e nenhum erro declarado à mão em `route.errors` se perde no merge; mais um caso nomeado
      reproduzindo o par `assignRole`/`revokeRole` (`/users/{userId}/roles/{roleId}`) que expôs o
      bug original.
- [x] As catorze rotas que omitiam o 422 passam a declará-lo, sem precisar tocar
      `packages/api-contracts/src/routes/**` — o merge central cobre todas de uma vez:
      `GET/DELETE /features/{id}`, `GET/DELETE /roles/{id}`,
      `GET /users/{userId}/features|roles|permissions`, `DELETE /users/{userId}/roles/{roleId}`,
      `DELETE /users/{userId}/roles/{roleId}/features/{featureId}`,
      `DELETE /users/{userId}/customer|employee`, `GET/DELETE /users/{id}`,
      `POST /users/{id}/unban`, `POST /users/{id}/unlock`, `DELETE /auth/sessions/{id}`.
- [x] Todas as rotas autenticadas continuam declarando o 401 — a derivação por `auth === "bearer"`
      é estrutural, e isto não regride: confirmado pela suíte nova.
- [x] A mudança do documento ficou **num commit só** (`104afd1`, `fix(api): derive 401 and 422 in
      the openapi doc instead of hand-listing them`), dizendo o que um consumidor (coleção Bruno,
      cliente gerado) vê de diferente: 422 passa a aparecer nas catorze rotas listadas acima.
- [x] Nenhum status muda de comportamento — `errors` nunca foi lido por `registerRoute`, só pelo
      adaptador do documento; a mudança é inteiramente sobre o que o `/openapi.json` descreve, não
      sobre o que a API responde. Suíte completa (87 arquivos, 1432 testes), `typecheck`, `lint` e
      `docs:check` verdes; `code-review` sem achados.

# `authenticate` desce do grupo para a rota, e o 404 passa a vencer o 401

> Fase 12, esforço `fase-12-module-depth`, issue 08. Continua o arco de
> [`0096`](0096-authenticate-saiu-app-ts-global-foi-grupo-rota.md) (do global para o grupo) e
> [`0097`](0097-optionalauthenticate-terceiro-modo-vitrine-publica.md): o último passo do
> middleware de autenticação em direção ao lugar onde ele é exigido.

O `registerRoute` lê o path inteiro da entrada da tabela de rotas, então o router de um módulo
migrado é montado **sem prefixo** — montá-lo em `/me` duplicaria o `/me` que a tabela já declara.
Com isso o `authenticate` perde o lugar onde morava: ele estava no `use` do prefixo
(`v1Router.use("/me", authenticate, meRouter)`) e passa a entrar no `before` de cada rota, que é
onde a tabela o exige (`auth: "bearer"`).

A consequência é visível de fora, e é a razão deste ADR. O `authenticate` no prefixo rodava em
**toda** requisição que começasse com ele, inclusive nas que não casavam com rota nenhuma: um
`POST /api/v1/me` sem `Bearer` recebia **401**. Agora ele não casa com rota nenhuma, o
`authenticate` não roda, e o Express responde **404**.

**Decidimos ficar com o 404**, e aplicá-lo a todo prefixo conforme ele migra (`/users`, `/pets`,
`/roles`, `/features`, `/variants`, `/customers/:customerId`). O 401 primeiro tem um mérito
genuíno — ele não conta a um visitante se o endereço existe —, mas esse mérito não se sustenta
aqui: a API publica o `/openapi.json` **sem token**, e a lista de rotas já é pública por decisão
de [`docs/adr/0003`](../../../../docs/adr/0003-route-table-is-contract-openapi-is-derived.md). O
404 não revela nada que o documento não revele. Em troca, a autenticação passa a ter **um lugar
só** — a rota que a exige —, em vez de depender de um prefixo de montagem concordar com a tabela.

É diferente do 403 vencer o 404 de
[`0011`](0011-autorizacao-sempre-antes-busca.md): lá o que não pode vazar é a existência de um
**recurso** (um id de usuário que o ator não pode ver), que é dado, e continua protegido. Aqui o
que o 404 revela é a existência de uma **rota**, que é contrato publicado.

Nenhum teste cobria o caso antes ou depois: o que muda é a resposta a um método que não existe,
e nenhum cliente a consome. A troca foi decidida pelo dono do projeto em 2026-09-23, depois de a
issue 08 a levantar e antes de as issues 09–15 a repetirem em escala.

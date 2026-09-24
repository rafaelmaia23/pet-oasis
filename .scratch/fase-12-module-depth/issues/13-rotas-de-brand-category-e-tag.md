# 13: As rotas de brand, category e tag passam ao registrador

**What to build:** as catorze rotas de marca, categoria (em árvore) e tag passam a sair da entrada da
tabela.

**Blocked by:** 08.

**Status:** fechada em 2026-09-24

- [x] As 14 rotas migraram, **um commit por rota** (mais um de correção que apagou um presenter
      esquecido no commit anterior): `GET /brands`, `POST /brands`, `PATCH /brands/:brandId`,
      `PUT /brands/:brandId/logo`, `DELETE /brands/:brandId/logo`, `DELETE /brands/:brandId`,
      `GET /categories`, `POST /categories`, `PATCH /categories/:categoryId`,
      `DELETE /categories/:categoryId`, `GET /tags`, `POST /tags`, `PATCH /tags/:tagId`,
      `DELETE /tags/:tagId`
- [x] A subárvore de categoria e a unicidade de slug não foram tocadas: `category.service.ts`,
      `category.tree.ts` e os repositories ficaram como estavam — só route/controller mudaram
- [x] Os resolvedores carrega-ou-404 do catálogo não foram tocados (fora do escopo, issue 07)
- [x] Nenhum status, corpo ou mensagem mudou: os testes de integração de brand, category e tag
      seguem verdes **sem alteração**, e nenhum teste foi apagado, acrescentado ou editado

**Como a migração parcial ficou verde a cada commit**, igual à 09: os três módulos misturam
leitura pública com escrita protegida no mesmo router, então o primeiro commit de cada um move o
mount de `src/routes/index.ts` para fora do prefixo `optionalAuthenticate` e faz o que ainda não
migrou soletrar o path inteiro com `authenticate` explícito — nenhum teste distingue a mensagem de
401 de token inválido entre `optionalAuthenticate`+`canAccess` e `authenticate` direto (só a
ausência de token é coberta), então a troca foi segura mesmo nas rotas que ainda não tinham virado
`registerRoute`. Ao fim de cada módulo o router fica **sem nenhum middleware de auth no prefixo**:
a leitura não tem view por feature efetiva (não precisa de ator) e a escrita carrega
`authenticate` no próprio `before`.

**Três presenters saíram**, a mesma consequência já vista em 08 e 09: `brand.presenter.ts`,
`category.presenter.ts` e `tag.presenter.ts` eram só `createPresenter(views)` e ficaram sem
chamador assim que a última rota que os usava migrou — no caso de category e tag isso aconteceu
uma rota **antes** da última do módulo (`update`, não `delete`, porque a exclusão nunca usou o
presenter), e o presenter de category acabou sobrevivendo a um commit a mais por descuido, corrigido
no commit seguinte.

**Um consumidor novo de `context`.** `PUT /brands/:brandId/logo` é a primeira rota fora de
`auth.transport.ts` a usar `context`: `uploadedFileContext` (`brand.routes.ts`) entrega o buffer
que `uploadSingleImage` já garantiu em `before`, do mesmo jeito que o cookie de refresh chega ao
handler de auth — o handler continua sem tocar `req`.

**Suíte verde a cada commit, com uma ressalva do ambiente.** O banco de teste é compartilhado
entre os agentes que trabalharam em paralelo nesta fase (mesmo projeto Compose
`pet-oasis-test`), e isso produziu falhas intermitentes e não relacionadas a este esforço —
`ECONNREFUSED`, `Unique constraint failed`, foreign key violada em `clearDatabase()` — em
arquivos de teste que esta issue nunca tocou (`seedFakeUsers`, `auth`, `permission`, `product`,
`user.profile`). Cada falha assim foi confirmada como contenção ao rodar o arquivo isolado logo
em seguida, sempre verde. A suíte completa (87 arquivos, 1510 testes) rodou verde ao final.

**Nenhum ADR novo**, como em 09: esta issue não decidiu nada — consumiu o registrador da 08 e
espelhou o desenho que 09 já tinha fixado para módulo misto público/protegido.

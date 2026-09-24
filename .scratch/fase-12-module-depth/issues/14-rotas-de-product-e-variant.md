# 14: As rotas de product e variant passam ao registrador

**What to build:** as onze rotas de produto, variante e imagem passam a sair da entrada da tabela —
o grupo com a escada de views mais profunda (público, interno, custo) e o único com upload.

**Blocked by:** 08.

**Status:** fechada em 2026-09-24

O que de fato ficou pronto — onde divergiu do plano, o porquê está ao lado:

- [x] As 11 rotas migraram, **um commit por rota**, cada uma com a suíte inteira verde (87
      arquivos, 1510 testes): as nove de `product.routes.ts` (`GET /products`,
      `GET /products/:idOrSlug`, `POST /products`, `PATCH /products/:productId`,
      `DELETE /products/:productId`, `POST /products/:productId/images`,
      `PATCH /products/:productId/images/order`, `DELETE /products/:productId/images/:imageId`,
      `POST /products/:productId/variants`) e as duas de `product.variant.routes.ts`
      (`PATCH /variants/:variantId`, `DELETE /variants/:variantId`). Os dois routers viraram
      "secos" (sem prefixo, sem router legado), e `src/routes/index.ts` perdeu os mounts
      `v1Router.use("/products", optionalAuthenticate, productRouter)` e
      `v1Router.use("/variants", authenticate, variantRouter)`.
- [x] A escada de views continua escolhida pela feature efetiva de quem pede, com o mesmo
      resultado — agora em `product.view-resolver.ts` (`chooseProductReadView`,
      `chooseProductWriteView`, `chooseProductListView`) e `product.variant.view-resolver.ts`
      (`chooseVariantWriteView`), delegando a decisão para `productService.readViewFor`/`viewFor` e
      o equivalente de variante, sem duplicar a regra.
- [x] O filtro da listagem continua coerente com a view escolhida: `?status=` continua condicionado
      a `includeHidden` (`canSeeInternal`), sem relação nova com a migração.
- [x] O upload de imagem continua com o mesmo limite de tamanho e o mesmo tipo aceito —
      `upload.middleware.ts` não foi tocado. O `req.file` passou a entrar pelo `context` do módulo
      (`product.transport.ts`, mesmo formato de `auth.transport.ts`: expõe só `{ file: Buffer }` via
      `uploadedFile(req)`), com `uploadSingleImage` continuando em `before`, na mesma ordem de
      antes (`canAccess` → limiter → multer).
- [x] A busca textual com tolerância a erro de digitação não foi tocada
      (`product.search.repository.ts`, `resolveSearch`/`correctAndSearch`) e continua com a mesma
      ordem de resultados.
- [x] Nenhum status, corpo ou mensagem muda. Um único teste precisou de ajuste — não de
      comportamento HTTP, mas de forma do documento gerado (ver decisão abaixo):
      `openapi.test.ts`, caso do eco de busca, passou a ler `schema.anyOf[0].properties.meta` em
      vez de `schema.properties.meta`.

**A decisão que a issue teve de tomar sozinha, e que vale registrar:** a entrada `list` (tabela)
já vinha com `view: productListSchema` **fixo** na view pública, mas o controller de então já
variava a view por item conforme a feature efetiva (é o que os testes de "atendente vê estoque,
gestor vê custo" provam) — a tabela estava desatualizada em relação ao comportamento real, e a
recusa de silenciosamente travar a lista na view pública era o único jeito de a migração não mudar
corpo nenhum. Como o `chooseView` do registrador escolhe **um schema por status**, não um schema
por item, a escada teve de subir para o nível do **envelope inteiro**: `productListSchema` virou a
função `productListSchemaFor(itemView)`, e a entrada `list` passou a declarar `productListLadder`
— os três envelopes (`public`/`internal`/`cost`), mesmo `meta` nos três. Isso é uma extensão do
mesmo mecanismo que a issue 11 já tinha aberto para `chooseView` (declarar escada, decidir no
registro), agora aplicada a um envelope de listagem em vez de a um objeto único — nenhuma issue
seguinte deveria precisar reabrir isto, mas é o primeiro lugar onde a escada aparece em cima de uma
lista paginada, e vale como referência se `pet`, `brand`, `category` ou `tag` precisarem do mesmo
em listagem própria. A consequência visível é só no documento: `/openapi.json` de `GET /products`
deixou de ser um objeto fixo e virou `anyOf` de três schemas — o comentário antigo em
`product.views.ts`, que rejeitava escada aqui por achar que uma união de três envelopes esconderia
o `meta` do leitor da spec, foi atualizado explicando o trade-off: legibilidade do doc perde para
"o corpo não pode mudar de comportamento numa migração".

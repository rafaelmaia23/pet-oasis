import {
  productImageParamsSchema,
  productImagesParamsSchema,
  reorderProductImagesSchema,
} from "../catalog/product.image.schema";
import {
  createProductSchema,
  listProductsSchema,
  productDetailParamsSchema,
  productParamsSchema,
  updateProductSchema,
} from "../catalog/product.schema";
import {
  createVariantSchema,
  updateVariantSchema,
  variantParamsSchema,
} from "../catalog/product.variant.schema";
import {
  productImageListSchema,
  productImageViews,
  productListSchemas,
  productReadSchemas,
  productWriteSchemas,
  variantWriteSchemas,
} from "../catalog/product.views";
import { errorResponses, noContent } from "./responses";
import type { RouteGroup } from "./route.types";

const VARIANT_NOTE =
  "Todo produto tem **pelo menos uma** variante, e exatamente uma delas é a default. Quando nenhuma vem marcada, a primeira é promovida; excluir a última variante ativa devolve 409.";

const COST_NOTE =
  "`costCents` só aparece para quem tem `read:product:cost` — a view é escolhida pelo ator, não pela rota.";

const VIEW_NOTE =
  "A **forma** da resposta muda com a feature efetiva do ator, não só o acesso: sem `read:product:internal` (inclusive anônimo) sai a view pública, sem `costCents`, sem `stockQuantity` e sem `status`, com `inStock` derivado no lugar da quantidade. `read:product:internal` destrava o estoque exato, o `status` e os produtos DRAFT/DISCONTINUED; `read:product:cost` destrava o custo **e** implica a visão interna.";

const SEARCH_NOTE =
  "`?q=` busca em nome e descrição do produto e no nome da marca, sem acento e por radical. Quando a busca literal não encontra nada, **o erro de digitação é corrigido palavra a palavra**: cada palavra que não existe no catálogo é trocada pela mais parecida e a busca roda de novo — e o que de fato foi buscado volta em `meta.search.applied`. Palavra sem vizinha parecida vai como está: a busca devolve vazio em vez de descartá-la em silêncio. Ter `?q=` torna `relevance` a ordenação default; `sort=relevance` **sem** `?q=` é 422. O dicionário de correção conhece só o catálogo público e é atualizado pelo seed, não a cada escrita — produto recém-cadastrado é encontrado na hora pela busca literal, mas só entra na correção de typo depois da próxima atualização. Numa busca o `meta.total` é **limitado**: contam-se no máximo 500 resultados.";

export const productRoutes = {
  list: {
    method: "GET",
    path: "/products",
    tag: "Products",
    auth: "public",
    summary: "Lista o catálogo — público, sem token",
    description: `${VIEW_NOTE}\n\nPaginada por offset e ordenável (\`?sort=&order=\`; \`price\` é o **menor preço entre as variantes ativas**). Três armadilhas que valem leitura: a faixa de preço filtra **pelas variantes** — o produto entra se alguma delas couber, mesmo que a default esteja fora —, \`?category=\` traz também os produtos das categorias **descendentes**, e \`?tag=\` repetido é **interseção** (o produto precisa ter todas). \`?species=\` casa também com os produtos sem espécie marcada, que valem para qualquer uma. Slug de marca, categoria ou tag que não existe é filtro, não erro: devolve lista vazia. \`?status=\` é **ignorado em silêncio** para quem não tem \`read:product:internal\`.\n\n${SEARCH_NOTE}`,
    request: listProductsSchema,
    responses: {
      200: {
        description: "Catálogo",
        // Escada de envelopes, um por degrau — o porquê está no
        // `productListSchema` (`packages/api-contracts/src/catalog/product.views.ts`).
        view: productListSchemas,
      },
    },
    errors: { 422: errorResponses[422], 429: errorResponses[429] },
  },
  create: {
    method: "POST",
    path: "/products",
    tag: "Products",
    auth: "bearer",
    summary: "Cria um produto com suas variantes — exige manage:product",
    description: `${VARIANT_NOTE} O \`slug\` é derivado do nome e congelado depois; \`categories\` exige no mínimo uma e \`targetSpecies\` vazio significa "qualquer espécie". ${COST_NOTE}`,
    request: createProductSchema,
    responses: {
      201: { description: "Produto criado", view: productWriteSchemas },
    },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      409: errorResponses[409],
      422: errorResponses[422],
    },
  },
  get: {
    method: "GET",
    path: "/products/:idOrSlug",
    tag: "Products",
    auth: "public",
    summary: "Detalha um produto por id ou slug — público, sem token",
    description: `${VIEW_NOTE}\n\nO valor no path é o **id ou o slug**: quem tem forma de UUID é tratado como id, o resto como slug — e a escrita recusa slug com forma de UUID, então não há caso ambíguo. Produto fora do conjunto visível do ator devolve **404**, com a mesma mensagem de inexistente: um 403 confirmaria o slug do rascunho para qualquer visitante. As variantes vêm com a default primeiro; variante excluída não acompanha o produto vivo.`,
    request: productDetailParamsSchema,
    responses: { 200: { description: "Produto", view: productReadSchemas } },
    errors: {
      404: errorResponses[404],
      422: errorResponses[422],
      429: errorResponses[429],
    },
  },
  update: {
    method: "PATCH",
    path: "/products/:productId",
    tag: "Products",
    auth: "bearer",
    summary: "Atualiza um produto — exige manage:product",
    description:
      "Renomear **não** muda o slug. `categories` e `tags` são substituição total: o array enviado passa a ser o conjunto, e o campo ausente preserva os vínculos atuais. Variantes têm rotas próprias e não entram aqui.",
    request: updateProductSchema,
    responses: {
      200: { description: "Produto atualizado", view: productWriteSchemas },
    },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
      409: errorResponses[409],
      422: errorResponses[422],
    },
  },
  delete: {
    method: "DELETE",
    path: "/products/:productId",
    tag: "Products",
    auth: "bearer",
    summary: "Exclui um produto — exige manage:product",
    description:
      "Soft delete, com cascata nas variantes: as duas tabelas recebem o mesmo timestamp. O produto continua ocupando nome e slug, e as variantes continuam ocupando os SKUs.",
    request: productParamsSchema,
    responses: { 204: noContent },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
      422: errorResponses[422],
    },
  },
  addImage: {
    method: "POST",
    path: "/products/:productId/images",
    tag: "Products",
    auth: "bearer",
    summary: "Envia uma imagem do produto — exige manage:product",
    description:
      "Um arquivo por request, no campo `file`. A imagem entra no fim da fila (`position`), e a **posição 0 é a capa** — é ela que a listagem devolve em `image`. Teto de 8 imagens por produto; a nona é 422. O formato é conferido pelos **bytes**, e o nome do arquivo enviado é descartado: quem nomeia é a API.",
    request: productImagesParamsSchema,
    upload: "image",
    responses: {
      201: { description: "Imagem criada", view: productImageViews.default },
    },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
      413: errorResponses[413],
      422: errorResponses[422],
      429: errorResponses[429],
    },
  },
  reorderImages: {
    method: "PATCH",
    path: "/products/:productId/images/order",
    tag: "Products",
    auth: "bearer",
    summary: "Reordena as imagens do produto — exige manage:product",
    description:
      "O corpo é o array **completo** de ids na ordem desejada: faltar ou sobrar imagem é 422, repetir id é 422, e nomear imagem de outro produto é 404. Idempotente — reenviar a ordem atual não muda nada. A capa é a posição 0; não existe flag separada.",
    request: reorderProductImagesSchema,
    responses: {
      200: {
        description: "Imagens na nova ordem",
        view: productImageListSchema,
      },
    },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
      422: errorResponses[422],
    },
  },
  deleteImage: {
    method: "DELETE",
    path: "/products/:productId/images/:imageId",
    tag: "Products",
    auth: "bearer",
    summary: "Exclui uma imagem do produto — exige manage:product",
    description:
      "**Hard delete**: a linha some junto com os arquivos, porque imagem é asset e não fato de negócio. As posições restantes são compactadas, então apagar a capa promove a seguinte. Imagem de outro produto é 404 — a resposta não revela que ela existe em outro lugar.",
    request: productImageParamsSchema,
    responses: { 204: noContent },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
      422: errorResponses[422],
    },
  },
} as const satisfies RouteGroup;

export const variantRoutes = {
  create: {
    method: "POST",
    path: "/products/:productId/variants",
    tag: "Variants",
    auth: "bearer",
    summary: "Cria uma variante — exige manage:product",
    description: `${VARIANT_NOTE} \`isDefault: true\` rebaixa a variante default anterior na mesma transação. O SKU é único **globalmente**, inclusive contra variantes excluídas.`,
    request: createVariantSchema,
    responses: {
      201: { description: "Variante criada", view: variantWriteSchemas },
    },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
      409: errorResponses[409],
      422: errorResponses[422],
    },
  },
  update: {
    method: "PATCH",
    path: "/variants/:variantId",
    tag: "Variants",
    auth: "bearer",
    summary: "Atualiza uma variante — manage:product e/ou manage:stock",
    description:
      "A feature é exigida **por campo presente**: `stockQuantity` pede `manage:stock`, qualquer outro campo pede `manage:product`, e um corpo que mistura os dois pede as duas — assim o repositor conta prateleira sem poder editar o catálogo. Ajuste de estoque vira uma ação própria no audit (`PRODUCT_STOCK_ADJUSTED`). `isDefault` só aceita `true`: para trocar a default, promova a outra.",
    request: updateVariantSchema,
    responses: {
      200: { description: "Variante atualizada", view: variantWriteSchemas },
    },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
      409: errorResponses[409],
      422: errorResponses[422],
    },
  },
  delete: {
    method: "DELETE",
    path: "/variants/:variantId",
    tag: "Variants",
    auth: "bearer",
    summary: "Exclui uma variante — exige manage:product",
    description:
      "Soft delete. Devolve **409** quando é a última variante ativa do produto — para tirar o produto de circulação use `status: DISCONTINUED` ou exclua o produto. Se a excluída era a default, a mais antiga entre as restantes é promovida.",
    request: variantParamsSchema,
    responses: { 204: noContent },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
      409: errorResponses[409],
      422: errorResponses[422],
    },
  },
} as const satisfies RouteGroup;

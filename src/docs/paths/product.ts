import { z } from "zod";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import { env } from "@/config/env";
import { offsetMetaSchema } from "@/lib/pagination";
import {
  productImageParamsSchema,
  productImagesParamsSchema,
  reorderProductImagesSchema,
} from "@/modules/product/product.image.schema";
import {
  productImagePresenter,
  productListViews,
  productViews,
  variantViews,
} from "@/modules/product/product.presenter";
import {
  createProductSchema,
  listProductsSchema,
  productDetailParamsSchema,
  productParamsSchema,
  updateProductSchema,
} from "@/modules/product/product.schema";
import {
  createVariantSchema,
  updateVariantSchema,
  variantParamsSchema,
} from "@/modules/product/product.variant.schema";
import { errorResponses, jsonResponse, noContentResponse } from "../components";
import { fromEnvelope, imageUploadBody } from "../helpers";

const VARIANT_NOTE =
  "Todo produto tem **pelo menos uma** variante, e exatamente uma delas é a default. Quando nenhuma vem marcada, a primeira é promovida; excluir a última variante ativa devolve 409.";

const COST_NOTE =
  "`costCents` só aparece para quem tem `read:product:cost` — a view é escolhida pelo ator, não pela rota.";

const VIEW_NOTE =
  "A **forma** da resposta muda com a capability do ator, não só o acesso: sem `read:product:internal` (inclusive anônimo) sai a view pública, sem `costCents`, sem `stockQuantity` e sem `status`, com `inStock` derivado no lugar da quantidade. `read:product:internal` destrava o estoque exato, o `status` e os produtos DRAFT/DISCONTINUED; `read:product:cost` destrava o custo **e** implica a visão interna.";

const SEARCH_NOTE =
  "`?q=` busca em nome e descrição do produto e no nome da marca, sem acento e por radical. Quando a busca literal não encontra nada, **o erro de digitação é corrigido palavra a palavra**: cada palavra que não existe no catálogo é trocada pela mais parecida e a busca roda de novo — e o que de fato foi buscado volta em `meta.search.applied`. Palavra sem vizinha parecida vai como está: a busca devolve vazio em vez de descartá-la em silêncio. Ter `?q=` torna `relevance` a ordenação default; `sort=relevance` **sem** `?q=` é 422. O dicionário de correção conhece só o catálogo público e é atualizado pelo seed, não a cada escrita — produto recém-cadastrado é encontrado na hora pela busca literal, mas só entra na correção de typo depois da próxima atualização. Numa busca o `meta.total` é **limitado**: contam-se no máximo 500 resultados.";

/**
 * A listagem ganha `meta.search` **só** quando veio `?q=` (9.9/Z15) — o
 * envelope de paginação segue idêntico ao das demais listagens do projeto.
 */
const searchMetaSchema = z
  .object({
    q: z.string().meta({ example: "racao golen" }),
    applied: z.string().meta({ example: "racao golden" }),
  })
  .meta({
    id: "ProductSearchMeta",
    description: "O que foi digitado e o que de fato foi buscado",
  });

const productListMetaSchema = offsetMetaSchema
  .extend({ search: searchMetaSchema.optional() })
  .meta({
    id: "ProductListMeta",
    description: "Paginação por offset, mais o eco da busca quando há `?q=`",
  });

export const productPaths: ZodOpenApiPathsObject = {
  "/products": {
    get: {
      tags: ["Products"],
      summary: "Lista o catálogo — público, sem token",
      // Sem isto o Scalar mostraria cadeado e o "try it" exigiria token numa
      // rota que responde sem ele.
      security: [],
      description: `${VIEW_NOTE}\n\nPaginada por offset e ordenável (\`?sort=&order=\`; \`price\` é o **menor preço entre as variantes ativas**). Três armadilhas que valem leitura: a faixa de preço filtra **pelas variantes** — o produto entra se alguma delas couber, mesmo que a default esteja fora —, \`?category=\` traz também os produtos das categorias **descendentes**, e \`?tag=\` repetido é **interseção** (o produto precisa ter todas). \`?species=\` casa também com os produtos sem espécie marcada, que valem para qualquer uma. Slug de marca, categoria ou tag que não existe é filtro, não erro: devolve lista vazia. \`?status=\` é **ignorado em silêncio** para quem não tem \`read:product:internal\`.\n\n${SEARCH_NOTE}`,
      ...fromEnvelope(listProductsSchema),
      responses: {
        200: jsonResponse(
          "Catálogo",
          z.object({
            data: z.array(productListViews.public),
            meta: productListMetaSchema,
          }),
        ),
        422: errorResponses[422],
        429: errorResponses[429],
      },
    },
    post: {
      tags: ["Products"],
      summary: "Cria um produto com suas variantes — exige manage:product",
      description: `${VARIANT_NOTE} O \`slug\` é derivado do nome e congelado depois; \`categories\` exige no mínimo uma e \`targetSpecies\` vazio significa "qualquer espécie". ${COST_NOTE}`,
      ...fromEnvelope(createProductSchema),
      responses: {
        201: jsonResponse("Produto criado", productViews.cost),
        401: errorResponses[401],
        403: errorResponses[403],
        409: errorResponses[409],
        422: errorResponses[422],
      },
    },
  },
  "/products/{idOrSlug}": {
    get: {
      tags: ["Products"],
      summary: "Detalha um produto por id ou slug — público, sem token",
      security: [],
      description: `${VIEW_NOTE}\n\nO valor no path é o **id ou o slug**: quem tem forma de UUID é tratado como id, o resto como slug — e a escrita recusa slug com forma de UUID, então não há caso ambíguo. Produto fora do conjunto visível do ator devolve **404**, com a mesma mensagem de inexistente: um 403 confirmaria o slug do rascunho para qualquer visitante. As variantes vêm com a default primeiro; variante excluída não acompanha o produto vivo.`,
      ...fromEnvelope(productDetailParamsSchema),
      responses: {
        200: jsonResponse("Produto", productViews.public),
        404: errorResponses[404],
        422: errorResponses[422],
        429: errorResponses[429],
      },
    },
  },
  "/products/{productId}": {
    patch: {
      tags: ["Products"],
      summary: "Atualiza um produto — exige manage:product",
      description:
        "Renomear **não** muda o slug. `categories` e `tags` são substituição total: o array enviado passa a ser o conjunto, e o campo ausente preserva os vínculos atuais. Variantes têm rotas próprias e não entram aqui.",
      ...fromEnvelope(updateProductSchema),
      responses: {
        200: jsonResponse("Produto atualizado", productViews.cost),
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
        409: errorResponses[409],
        422: errorResponses[422],
      },
    },
    delete: {
      tags: ["Products"],
      summary: "Exclui um produto — exige manage:product",
      description:
        "Soft delete, com cascata nas variantes: as duas tabelas recebem o mesmo timestamp. O produto continua ocupando nome e slug, e as variantes continuam ocupando os SKUs.",
      ...fromEnvelope(productParamsSchema),
      responses: {
        204: noContentResponse,
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
        422: errorResponses[422],
      },
    },
  },
  "/products/{productId}/variants": {
    post: {
      tags: ["Variants"],
      summary: "Cria uma variante — exige manage:product",
      description: `${VARIANT_NOTE} \`isDefault: true\` rebaixa a variante default anterior na mesma transação. O SKU é único **globalmente**, inclusive contra variantes excluídas.`,
      ...fromEnvelope(createVariantSchema),
      responses: {
        201: jsonResponse("Variante criada", variantViews.cost),
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
        409: errorResponses[409],
        422: errorResponses[422],
      },
    },
  },
  "/variants/{variantId}": {
    patch: {
      tags: ["Variants"],
      summary: "Atualiza uma variante — manage:product e/ou manage:stock",
      description:
        "A feature é exigida **por campo presente**: `stockQuantity` pede `manage:stock`, qualquer outro campo pede `manage:product`, e um corpo que mistura os dois pede as duas — assim o repositor conta prateleira sem poder editar o catálogo. Ajuste de estoque vira uma ação própria no audit (`PRODUCT_STOCK_ADJUSTED`). `isDefault` só aceita `true`: para trocar a default, promova a outra.",
      ...fromEnvelope(updateVariantSchema),
      responses: {
        200: jsonResponse("Variante atualizada", variantViews.cost),
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
        409: errorResponses[409],
        422: errorResponses[422],
      },
    },
    delete: {
      tags: ["Variants"],
      summary: "Exclui uma variante — exige manage:product",
      description:
        "Soft delete. Devolve **409** quando é a última variante ativa do produto — para tirar o produto de circulação use `status: DISCONTINUED` ou exclua o produto. Se a excluída era a default, a mais antiga entre as restantes é promovida.",
      ...fromEnvelope(variantParamsSchema),
      responses: {
        204: noContentResponse,
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
        409: errorResponses[409],
        422: errorResponses[422],
      },
    },
  },
  "/products/{productId}/images": {
    post: {
      tags: ["Products"],
      summary: "Envia uma imagem do produto — exige manage:product",
      description:
        "Um arquivo por request, no campo `file`. A imagem entra no fim da fila (`position`), e a **posição 0 é a capa** — é ela que a listagem devolve em `image`. Teto de 8 imagens por produto; a nona é 422. O formato é conferido pelos **bytes**, e o nome do arquivo enviado é descartado: quem nomeia é a API.",
      ...fromEnvelope(productImagesParamsSchema),
      ...imageUploadBody(env.UPLOAD_MAX_FILE_SIZE_BYTES),
      responses: {
        201: jsonResponse("Imagem criada", productImagePresenter.views.default),
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
        413: errorResponses[413],
        422: errorResponses[422],
        429: errorResponses[429],
      },
    },
  },
  "/products/{productId}/images/order": {
    patch: {
      tags: ["Products"],
      summary: "Reordena as imagens do produto — exige manage:product",
      description:
        "O corpo é o array **completo** de ids na ordem desejada: faltar ou sobrar imagem é 422, repetir id é 422, e nomear imagem de outro produto é 404. Idempotente — reenviar a ordem atual não muda nada. A capa é a posição 0; não existe flag separada.",
      ...fromEnvelope(reorderProductImagesSchema),
      responses: {
        200: jsonResponse(
          "Imagens na nova ordem",
          z.object({ data: z.array(productImagePresenter.views.default) }),
        ),
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
        422: errorResponses[422],
      },
    },
  },
  "/products/{productId}/images/{imageId}": {
    delete: {
      tags: ["Products"],
      summary: "Exclui uma imagem do produto — exige manage:product",
      description:
        "**Hard delete**: a linha some junto com os arquivos, porque imagem é asset e não fato de negócio. As posições restantes são compactadas, então apagar a capa promove a seguinte. Imagem de outro produto é 404 — a resposta não revela que ela existe em outro lugar.",
      ...fromEnvelope(productImageParamsSchema),
      responses: {
        204: noContentResponse,
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
        422: errorResponses[422],
      },
    },
  },
};

import { z } from "zod";
import { buildOffsetQuerySchema, defineSortConfig } from "../pagination";
import { petSpeciesSchema } from "../pet/pet.enums";
import { productStatusSchema } from "./catalog.enums";
import { catalogNameSchema, slugSchema } from "./catalog.schema";
import { variantFieldsSchema } from "./product.variant.schema";

/**
 * Validação **sintática** do produto. Nome e slug vêm de `catalog.schema` — a
 * mesma regra da taxonomia (9.6/W4 e W6), reaplicada aqui em vez de reescrita.
 * O que precisa de banco (marca/categoria/tag existem e estão ativas) é do
 * service; a unicidade de `slug` e `sku` é do banco, e sai 409 pelo P2002.
 *
 * A descrição tem regra própria, não a de 500 caracteres da taxonomia: uma
 * página de produto não é um rótulo de categoria.
 */
const productDescriptionSchema = z
  .string()
  .trim()
  .min(1, "Description is required")
  .max(2000, "Description must be at most 2000 characters")
  .meta({
    example: "Ração seca para cães adultos de porte médio, sabor frango.",
  });

/**
 * As duas invariantes que se decidem olhando **só o corpo** ficam aqui, e não
 * no service: SKU repetido entre as variantes enviadas (o 409 do banco não
 * diria qual das duas), e mais de uma variante marcada como default (X5 — quem
 * elege a default quando nenhuma vem é o service, que promove a primeira).
 */
const variantsArraySchema = z
  .array(variantFieldsSchema.strict())
  .min(1, "At least one variant is required")
  .max(50, "A product can have at most 50 variants")
  .refine(
    (variants) =>
      new Set(variants.map((variant) => variant.sku)).size === variants.length,
    { message: "Variant SKUs must be unique within the product" },
  )
  .refine(
    (variants) => variants.filter((variant) => variant.isDefault).length <= 1,
    { message: "Only one variant can be marked as default" },
  );

/**
 * Duplicata é recusada aqui, e não no banco: o vínculo tem PK composta, então
 * o id repetido furaria a constraint e sairia como um 409 falando de
 * `product_id` — erro que manda procurar bug no lugar errado. Mesma regra que
 * a lista de variantes (SKU repetido) e o array de reordenação de imagem.
 */
const uniqueIds = (ids: string[]) => new Set(ids).size === ids.length;

const categoriesSchema = z
  .array(z.uuid("Invalid category ID"))
  .min(1, "At least one category is required")
  .max(20, "A product can have at most 20 categories")
  .refine(uniqueIds, { message: "Categories must not repeat" });

const productFieldsSchema = z.object({
  name: catalogNameSchema,
  slug: slugSchema.optional(),
  description: productDescriptionSchema,
  brandId: z.uuid("Invalid brand ID"),
  status: productStatusSchema.optional().meta({
    description: "DRAFT (padrão), ACTIVE ou DISCONTINUED",
    example: "DRAFT",
  }),
  // Faceta, não nível da árvore (N7). Vazio significa "qualquer espécie".
  targetSpecies: z
    .array(petSpeciesSchema)
    .optional()
    .meta({ description: "Espécies-alvo; vazio = qualquer espécie" }),
  // Substituição total (X7): o array enviado passa a ser o conjunto.
  categories: categoriesSchema,
  tags: z
    .array(z.uuid("Invalid tag ID"))
    .max(20, "A product can have at most 20 tags")
    .refine(uniqueIds, { message: "Tags must not repeat" })
    .optional(),
});

export const productParamsSchema = z.object({
  params: z.object({
    productId: z.uuid("Invalid product ID"),
  }),
});

/**
 * O detalhe aceita id **ou** slug na mesma rota (9.8/Y2), então o param é
 * string livre: exigir uuid aqui mataria metade do contrato. Quem desempata é o
 * service, pela forma do valor — e o que torna isso não-ambíguo é o `slugSchema`
 * recusar, na escrita, slug com cara de uuid.
 */
export const productDetailParamsSchema = z.object({
  params: z.object({
    idOrSlug: z
      .string()
      .trim()
      .min(1, "Product id or slug is required")
      .max(80, "Product id or slug must be at most 80 characters"),
  }),
});

/**
 * Allowlist de ordenação de `GET /products` (Y7). `price` não é coluna do
 * produto: é o **menor preço entre as variantes ativas** (Y3), e o repository o
 * resolve por agregação. A direção declarada é a natural de cada campo —
 * novidade primeiro, texto e preço subindo.
 *
 * `relevance` (9.9/Z3) também não é coluna: é a ordem dos ids que a busca
 * devolve. Ela só existe com `?q=`, e o default do recurso continua sendo
 * `createdAt` — quem troca o default quando há busca é o service, porque um
 * default que depende de outro parâmetro não cabe no `defineSortConfig`.
 */
export const PRODUCT_SORT = defineSortConfig({
  fields: { createdAt: "desc", name: "asc", price: "asc", relevance: "desc" },
  default: "createdAt",
});

/**
 * `?tag=` é repetível e o Express entrega **string** quando vem um valor só e
 * **array** quando vêm dois — normalizar aqui é o que deixa o resto do fluxo
 * lidando sempre com lista.
 */
const repeatableSlug = z
  .union([slugSchema, z.array(slugSchema)])
  .transform((value) => (Array.isArray(value) ? value : [value]))
  .optional()
  .meta({
    description: "Slug da tag; repetível — o produto precisa ter todas (E)",
    example: "promocao",
  });

const priceFilter = (description: string) =>
  z.coerce
    .number()
    .int("Price must be an integer number of cents")
    .nonnegative("Price cannot be negative")
    .optional()
    .meta({ description, example: 1000 });

/**
 * Listagem da vitrine. Todo filtro de taxonomia é por **slug** — é a chave que
 * a URL pública carrega —, e slug bem-formado que não existe devolve lista
 * vazia, nunca 404: filtro não é resolução de recurso (V2).
 *
 * `status` é aceito de todo mundo no schema e **descartado no service** para
 * quem não tem `read:product:internal` (Y1): recusá-lo aqui com 422 confirmaria
 * ao visitante que existe um estado escondido.
 */
export const listProductsSchema = z.object({
  query: buildOffsetQuerySchema(PRODUCT_SORT, {
    species: petSpeciesSchema.optional().meta({
      description:
        "Filtra pela espécie-alvo; produtos sem espécie marcada entram em qualquer uma",
      example: "DOG",
    }),
    category: slugSchema.optional().meta({
      description: "Slug da categoria; inclui os produtos das descendentes",
      example: "racao-seca",
    }),
    tag: repeatableSlug,
    brand: slugSchema
      .optional()
      .meta({ description: "Slug da marca", example: "golden" }),
    minPrice: priceFilter(
      "Preço mínimo em centavos; o produto entra se alguma variante couber",
    ),
    maxPrice: priceFilter(
      "Preço máximo em centavos; o produto entra se alguma variante couber",
    ),
    status: productStatusSchema.optional().meta({
      description:
        "Filtra pelo status — ignorado para quem não tem read:product:internal",
      example: "ACTIVE",
    }),
    inStock: z
      .stringbool({ truthy: ["true"], falsy: ["false"] })
      .optional()
      .meta({
        description:
          "true = apenas com estoque; false = apenas esgotados; omitido = ambos",
        example: true,
      }),
    // Busca textual (9.9/Z6). Vazio depois do trim é **422**, e não ignorado
    // em silêncio como o `?status=` da Y1: lá havia um segredo a proteger,
    // aqui não há, e o erro ajuda quem está integrando. Abaixo de 3
    // caracteres a correção de erro de digitação não é tentada (Z13), então
    // o mínimo 2 aceita a busca sem prometer tolerância a typo nela.
    q: z
      .string()
      .trim()
      .min(2, "q must be at least 2 characters")
      .max(100, "q must be at most 100 characters")
      .optional()
      .meta({
        description:
          "Busca textual em nome e descrição do produto e no nome da marca; erro de digitação é corrigido palavra a palavra",
        example: "racao golden",
      }),
  }).refine((query) => query.sort !== "relevance" || query.q !== undefined, {
    path: ["sort"],
    error: "sort=relevance exige q",
  }),
});

export const createProductSchema = z.object({
  body: productFieldsSchema.extend({ variants: variantsArraySchema }).strict(),
});

/**
 * `variants` fica de fora do PATCH de propósito: variante tem rotas próprias, e
 * aceitá-la aqui obrigaria a inventar a semântica de "substituir o conjunto de
 * variantes", que apagaria SKU vendido sem ninguém pedir.
 */
export const updateProductSchema = z.object({
  params: productParamsSchema.shape.params,
  body: productFieldsSchema
    .strict()
    .partial()
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field must be provided for update",
    }),
});

export type CreateProductInput = z.infer<typeof createProductSchema>["body"];
export type UpdateProductInput = z.infer<typeof updateProductSchema>["body"];
export type ListProductsQuery = z.infer<typeof listProductsSchema>["query"];

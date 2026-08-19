import { z } from "zod";
import { PetSpecies, ProductStatus } from "@/generated/prisma/enums";
import {
  catalogNameSchema,
  slugSchema,
} from "@/modules/catalog/catalog.schema";
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

const categoriesSchema = z
  .array(z.uuid("Invalid category ID"))
  .min(1, "At least one category is required")
  .max(20, "A product can have at most 20 categories");

const productFieldsSchema = z.object({
  name: catalogNameSchema,
  slug: slugSchema.optional(),
  description: productDescriptionSchema,
  brandId: z.uuid("Invalid brand ID"),
  status: z.enum(ProductStatus).optional().meta({
    description: "DRAFT (padrão), ACTIVE ou DISCONTINUED",
    example: ProductStatus.DRAFT,
  }),
  // Faceta, não nível da árvore (N7). Vazio significa "qualquer espécie".
  targetSpecies: z
    .array(z.enum(PetSpecies))
    .optional()
    .meta({ description: "Espécies-alvo; vazio = qualquer espécie" }),
  // Substituição total (X7): o array enviado passa a ser o conjunto.
  categories: categoriesSchema,
  tags: z
    .array(z.uuid("Invalid tag ID"))
    .max(20, "A product can have at most 20 tags")
    .optional(),
});

export const productParamsSchema = z.object({
  params: z.object({
    productId: z.uuid("Invalid product ID"),
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

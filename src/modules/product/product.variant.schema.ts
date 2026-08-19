import { z } from "zod";

/**
 * Validação **sintática** da variante — a unidade vendável. O que precisa de
 * banco (produto existe, SKU já usado, é a última variante ativa) é do service.
 *
 * Dinheiro em centavos inteiros (N9) e estoque não-negativo (9.7/X2): sem
 * carrinho, o único caminho de mudança é edição manual do staff, e não existe
 * caminho legítimo para negativo nesta fase.
 */

const centsSchema = z
  .int("Value must be an integer number of cents")
  .min(0, "Value cannot be negative")
  .max(99_999_999, "Value is too large");

export const variantFieldsSchema = z.object({
  sku: z
    .string()
    .trim()
    .min(1, "SKU is required")
    .max(40, "SKU must be at most 40 characters")
    .meta({ example: "GOLDEN-AD-15KG" }),
  // Rótulo que o cliente lê no seletor de variante (9.7/X10): informado pelo
  // staff, nunca derivado das características.
  label: z
    .string()
    .trim()
    .min(1, "Label is required")
    .max(60, "Label must be at most 60 characters")
    .meta({ example: "15 kg" }),
  priceCents: centsSchema.meta({
    description: "Preço de venda em centavos",
    example: 24990,
  }),
  compareAtPriceCents: centsSchema.nullable().optional().meta({
    description: "Preço 'de', para exibir o desconto",
  }),
  costCents: centsSchema.nullable().optional().meta({
    description: "Custo — só aparece para quem tem read:product:cost",
  }),
  stockQuantity: z
    .int("Stock must be an integer")
    .min(0, "Stock cannot be negative")
    .optional()
    .meta({ description: "Quantidade em estoque", example: 12 }),
  weightGrams: z
    .int("Weight must be an integer number of grams")
    .positive("Weight must be positive")
    .nullable()
    .optional()
    .meta({ example: 15000 }),
  volumeMl: z
    .int("Volume must be an integer number of millilitres")
    .positive("Volume must be positive")
    .nullable()
    .optional(),
  sizeLabel: z
    .string()
    .trim()
    .max(40, "Size label must be at most 40 characters")
    .nullable()
    .optional()
    .meta({ example: "M" }),
  barcode: z
    .string()
    .trim()
    .max(40, "Barcode must be at most 40 characters")
    .nullable()
    .optional(),
  isDefault: z.boolean().optional().meta({
    description: "A variante que a vitrine mostra primeiro",
  }),
});

export const variantParamsSchema = z.object({
  params: z.object({
    variantId: z.uuid("Invalid variant ID"),
  }),
});

export const createVariantSchema = z.object({
  params: z.object({
    productId: z.uuid("Invalid product ID"),
  }),
  body: variantFieldsSchema.strict(),
});

/**
 * `isDefault: false` não entra: rebaixar a default sem eleger outra deixaria o
 * produto sem nenhuma, contra o X5. Quem quer trocar promove a outra, e o
 * service rebaixa a atual — a operação é sempre "promova esta".
 */
export const updateVariantSchema = z.object({
  params: variantParamsSchema.shape.params,
  body: variantFieldsSchema
    .extend({
      isDefault: z.literal(
        true,
        "To change the default variant, promote the other one",
      ),
    })
    .strict()
    .partial()
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field must be provided for update",
    }),
});

export type VariantInput = z.infer<typeof variantFieldsSchema>;
export type CreateVariantInput = z.infer<typeof createVariantSchema>["body"];
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>["body"];

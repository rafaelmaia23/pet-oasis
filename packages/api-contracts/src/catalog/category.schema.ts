import { z } from "zod";
import {
  catalogDescriptionSchema,
  catalogNameSchema,
  slugSchema,
} from "./catalog.schema";

/**
 * Validação **sintática** da categoria. As regras da árvore (pai existe,
 * profundidade máxima, ciclo) são semânticas — precisam das outras categorias —
 * e vivem no `category.service`; aqui `parentId` é só "uuid, se vier".
 */

const categoryFieldsSchema = z.object({
  name: catalogNameSchema,
  slug: slugSchema.optional(),
  description: catalogDescriptionSchema.nullable().optional(),
  // `null` é "categoria raiz", e é diferente de ausente: no PATCH, mandar
  // `null` promove o nó ao topo, e não mandar nada preserva o pai atual.
  parentId: z.uuid("Invalid parent category ID").nullable().optional(),
  position: z
    .int("Position must be an integer")
    .min(0, "Position cannot be negative")
    .max(9999, "Position must be at most 9999")
    .optional()
    .meta({ description: "Ordem entre categorias irmãs", example: 0 }),
});

export const categoryParamsSchema = z.object({
  params: z.object({
    categoryId: z.uuid("Invalid category ID"),
  }),
});

export const createCategorySchema = z.object({
  body: categoryFieldsSchema.strict(),
});

export const updateCategorySchema = z.object({
  params: categoryParamsSchema.shape.params,
  body: categoryFieldsSchema
    .strict()
    .partial()
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field must be provided for update",
    }),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>["body"];
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>["body"];

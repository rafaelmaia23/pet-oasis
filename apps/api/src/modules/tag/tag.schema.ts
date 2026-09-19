import {
  catalogNameSchema,
  slugSchema,
} from "@pet-oasis/api-contracts/catalog";
import { z } from "zod";

/**
 * Tag é o mais enxuto dos três recursos de taxonomia: nome e slug, nada mais.
 * Sem `description` de propósito — um rótulo que precisa ser explicado não é
 * rótulo, é categoria.
 */

const tagFieldsSchema = z.object({
  name: catalogNameSchema,
  slug: slugSchema.optional(),
});

export const tagParamsSchema = z.object({
  params: z.object({
    tagId: z.uuid("Invalid tag ID"),
  }),
});

export const createTagSchema = z.object({
  body: tagFieldsSchema.strict(),
});

export const updateTagSchema = z.object({
  params: tagParamsSchema.shape.params,
  body: tagFieldsSchema
    .strict()
    .partial()
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field must be provided for update",
    }),
});

export type CreateTagInput = z.infer<typeof createTagSchema>["body"];
export type UpdateTagInput = z.infer<typeof updateTagSchema>["body"];

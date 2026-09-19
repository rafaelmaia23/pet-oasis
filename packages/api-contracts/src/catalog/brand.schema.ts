import { z } from "zod";
import {
  catalogDescriptionSchema,
  catalogNameSchema,
  slugSchema,
} from "./catalog.schema";

/**
 * Validação **sintática** da marca — forma e tamanho, sem banco. A unicidade de
 * `name`/`slug` é do banco (`@unique` global, 9.6/W6) e sai como 409 pelo
 * handler de P2002; a derivação do slug é do service.
 */

const brandFieldsSchema = z.object({
  name: catalogNameSchema,
  // Opcional na criação: o caminho comum é derivar do nome (W4). Informar é a
  // saída para colisão de slug e para SEO deliberado.
  slug: slugSchema.optional(),
  description: catalogDescriptionSchema.nullable().optional(),
});

export const brandParamsSchema = z.object({
  params: z.object({
    brandId: z.uuid("Invalid brand ID"),
  }),
});

export const createBrandSchema = z.object({
  body: brandFieldsSchema.strict(),
});

export const updateBrandSchema = z.object({
  params: brandParamsSchema.shape.params,
  body: brandFieldsSchema
    .extend({
      // Preenchido pelo upload (9.10), nunca por corpo de PATCH — mesmo
      // tratamento de `Pet.photoPath`.
      logoPath: z.never("Logo is managed through the image upload endpoint"),
    })
    .strict()
    .partial()
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field must be provided for update",
    }),
});

export type CreateBrandInput = z.infer<typeof createBrandSchema>["body"];
export type UpdateBrandInput = z.infer<typeof updateBrandSchema>["body"];

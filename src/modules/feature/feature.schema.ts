import { z } from "zod";

export const createFeatureSchema = z.object({
  body: z.object({
    name: z
      .string()
      .min(1, "Name is required")
      .max(100, "Name must be less than 100 characters"),
    description: z
      .string()
      .max(255, "Description must be less than 255 characters")
      .nullish(),
  }),
});

export const updateFeatureSchema = z.object({
  params: z.object({
    id: z.guid("Invalid feature ID"),
  }),
  body: z
    .object({
      name: z
        .string()
        .min(1, "Name is required")
        .max(100, "Name must be less than 100 characters"),
      description: z
        .string()
        .max(255, "Description must be less than 255 characters")
        .nullish(),
    })
    .partial(),
});

export const featureParamsSchema = z.object({
  params: z.object({
    id: z.guid("Invalid feature ID"),
  }),
});

export type CreateFeatureInput = z.infer<typeof createFeatureSchema>["body"];
export type UpdateFeatureInput = z.infer<typeof updateFeatureSchema>["body"];

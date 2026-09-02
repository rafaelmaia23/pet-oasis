import { z } from "zod";
import { MAX_IMAGES_PER_PRODUCT } from "./product.image.constants";

/**
 * Validação **sintática** das imagens. O arquivo em si não passa por aqui: quem
 * o valida é o pipeline (`src/lib/storage/`), por magic bytes, porque
 * `Content-Type` e extensão são texto que o cliente escreve. O que sobra para o
 * Zod é o que vem em params e no corpo da reordenação.
 */

export const productImagesParamsSchema = z.object({
  params: z.object({
    productId: z.uuid("Invalid product ID"),
  }),
});

export const productImageParamsSchema = z.object({
  params: z.object({
    productId: z.uuid("Invalid product ID"),
    imageId: z.uuid("Invalid image ID"),
  }),
});

export const reorderProductImagesSchema = z.object({
  params: productImagesParamsSchema.shape.params,
  body: z
    .object({
      // Array COMPLETO na ordem desejada (9.10/AA13). O `refine` de unicidade é
      // o que impede `[a, a]` de passar pelo par "todos existem" + "o tamanho
      // bate" no service e deixar uma imagem sem posição.
      images: z
        .array(z.uuid("Invalid image ID"))
        .min(1, "Informe ao menos uma imagem")
        .max(MAX_IMAGES_PER_PRODUCT)
        .refine((ids) => new Set(ids).size === ids.length, {
          message: "A ordem não pode repetir a mesma imagem",
        }),
    })
    .strict(),
});

export type ReorderProductImagesInput = z.infer<
  typeof reorderProductImagesSchema
>["body"];

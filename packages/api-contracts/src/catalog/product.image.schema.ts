import { z } from "zod";

/**
 * Teto de imagens por produto. Constante e não env var (9.10/AA19): "um produto
 * tem no máximo 8 imagens" não muda entre dev e produção — é regra de domínio,
 * e regra que mora em env é regra que ninguém acha lendo o domínio. É contrato
 * porque o cliente precisa saber quando parar de oferecer upload, e porque é o
 * teto do array de reordenação abaixo.
 *
 * É também o limite estrutural do crescimento de disco, mais forte que qualquer
 * rate limit: o número de arquivos é no máximo 8 × produtos, e produto só nasce
 * pelas mãos de quem tem `manage:product`.
 */
export const MAX_IMAGES_PER_PRODUCT = 8;

/**
 * Validação **sintática** das imagens. O arquivo em si não passa por aqui: quem
 * o valida é o pipeline de storage da API, por magic bytes, porque
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

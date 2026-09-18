import type { ZodOpenApiPathsObject } from "zod-openapi";
import { env } from "@/config/env";
import { brandViews } from "@/modules/brand/brand.presenter";
import {
  brandParamsSchema,
  createBrandSchema,
  updateBrandSchema,
} from "@/modules/brand/brand.schema";
import {
  errorResponses,
  jsonResponse,
  noContentResponse,
  staticList,
} from "../components";
import { fromEnvelope, imageUploadBody } from "../helpers";

const SLUG_NOTE =
  "O `slug` é derivado do nome na criação e **congelado** depois: renomear a marca não muda a URL pública. Para mudá-lo, mande o campo `slug` explicitamente.";

export const brandPaths: ZodOpenApiPathsObject = {
  "/brands": {
    get: {
      tags: ["Brands"],
      summary: "Lista as marcas do catálogo — rota pública",
      description:
        "Responde sem token (a vitrine é pública). Sem paginação (`meta {}`): a taxonomia é conjunto pequeno e estável. Marca excluída não aparece.",
      // Sobrescreve o `bearerAuth` do documento: a vitrine responde sem token.
      security: [],
      responses: {
        200: jsonResponse("Marcas do catálogo", staticList(brandViews.default)),
        429: errorResponses[429],
      },
    },
    post: {
      tags: ["Brands"],
      summary: "Cria uma marca — exige manage:catalog-structure",
      description: `${SLUG_NOTE} Nome e slug são únicos globalmente, inclusive contra marcas excluídas — recriar uma marca apagada devolve 409.`,
      ...fromEnvelope(createBrandSchema),
      responses: {
        201: jsonResponse("Marca criada", brandViews.default),
        401: errorResponses[401],
        403: errorResponses[403],
        409: errorResponses[409],
        422: errorResponses[422],
      },
    },
  },
  "/brands/{brandId}": {
    patch: {
      tags: ["Brands"],
      summary: "Atualiza uma marca — exige manage:catalog-structure",
      description: SLUG_NOTE,
      ...fromEnvelope(updateBrandSchema),
      responses: {
        200: jsonResponse("Marca atualizada", brandViews.default),
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
        409: errorResponses[409],
        422: errorResponses[422],
      },
    },
    delete: {
      tags: ["Brands"],
      summary: "Exclui uma marca — exige manage:catalog-structure",
      description:
        "Soft delete: a linha permanece e continua ocupando o nome e o slug.",
      ...fromEnvelope(brandParamsSchema),
      responses: {
        204: noContentResponse,
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
        422: errorResponses[422],
      },
    },
  },
  "/brands/{brandId}/logo": {
    put: {
      tags: ["Brands"],
      summary: "Define o logo da marca — exige manage:catalog-structure",
      description:
        "Valor **único**: `PUT` substitui o logo anterior e apaga o arquivo antigo. Devolve a marca. `PATCH /brands/{brandId}` recusa `logoPath` no corpo, então o upload é o único caminho.",
      ...fromEnvelope(brandParamsSchema),
      ...imageUploadBody(env.UPLOAD_MAX_FILE_SIZE_BYTES),
      responses: {
        200: jsonResponse("Marca com o logo atualizado", brandViews.default),
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
        413: errorResponses[413],
        422: errorResponses[422],
        429: errorResponses[429],
      },
    },
    delete: {
      tags: ["Brands"],
      summary: "Remove o logo da marca — exige manage:catalog-structure",
      description:
        "Apaga o arquivo e limpa a coluna. **Idempotente**: marca sem logo responde 204.",
      ...fromEnvelope(brandParamsSchema),
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

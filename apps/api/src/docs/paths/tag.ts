import {
  createTagSchema,
  tagParamsSchema,
  tagViews,
  updateTagSchema,
} from "@pet-oasis/api-contracts/catalog";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import {
  errorResponses,
  jsonResponse,
  noContentResponse,
  staticList,
} from "../components";
import { fromEnvelope } from "../helpers";

export const tagPaths: ZodOpenApiPathsObject = {
  "/tags": {
    get: {
      tags: ["Tags"],
      summary: "Lista as tags do catálogo — rota pública",
      description:
        "Responde sem token. Sem paginação (`meta {}`), ordenada por nome.",
      security: [],
      responses: {
        200: jsonResponse("Tags do catálogo", staticList(tagViews.default)),
        429: errorResponses[429],
      },
    },
    post: {
      tags: ["Tags"],
      summary: "Cria uma tag — exige manage:catalog-structure",
      description:
        "O `slug` é derivado do nome e congelado depois. Nome e slug são únicos.",
      ...fromEnvelope(createTagSchema),
      responses: {
        201: jsonResponse("Tag criada", tagViews.default),
        401: errorResponses[401],
        403: errorResponses[403],
        409: errorResponses[409],
        422: errorResponses[422],
      },
    },
  },
  "/tags/{tagId}": {
    patch: {
      tags: ["Tags"],
      summary: "Atualiza uma tag — exige manage:catalog-structure",
      ...fromEnvelope(updateTagSchema),
      responses: {
        200: jsonResponse("Tag atualizada", tagViews.default),
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
        409: errorResponses[409],
        422: errorResponses[422],
      },
    },
    delete: {
      tags: ["Tags"],
      summary: "Exclui uma tag — exige manage:catalog-structure",
      description:
        "**Hard delete**, ao contrário de marca e categoria: a linha some e o nome volta a ficar livre. Rótulo transversal não participa de venda, então não há histórico a preservar.",
      ...fromEnvelope(tagParamsSchema),
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

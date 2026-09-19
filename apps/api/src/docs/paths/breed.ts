import { breedViews, listBreedsSchema } from "@pet-oasis/api-contracts/pet";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import { errorResponses, jsonResponse, staticList } from "../components";
import { fromEnvelope } from "../helpers";

export const breedPaths: ZodOpenApiPathsObject = {
  "/breeds": {
    get: {
      tags: ["Breeds"],
      summary: "Lista as raças do catálogo — rota pública",
      // Sobrescreve o `bearerAuth` do documento: a vitrine responde sem token.
      security: [],
      ...fromEnvelope(listBreedsSchema),
      responses: {
        200: jsonResponse("Catálogo de raças", staticList(breedViews.default)),
        422: errorResponses[422],
      },
    },
  },
};

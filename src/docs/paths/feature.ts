import { z } from "zod";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import { featureViews } from "@/modules/feature/feature.presenter";
import { featureParamsSchema } from "@/modules/feature/feature.schema";
import { errorResponses, jsonResponse } from "../components";
import { fromEnvelope } from "../helpers";

export const featurePaths: ZodOpenApiPathsObject = {
  "/features": {
    get: {
      tags: ["Features"],
      summary: "Lista as features do sistema — exige read:feature",
      responses: {
        200: jsonResponse(
          "Catálogo de features",
          z.array(featureViews.default),
        ),
        401: errorResponses[401],
        403: errorResponses[403],
      },
    },
  },
  "/features/{id}": {
    get: {
      tags: ["Features"],
      summary: "Busca uma feature por id — exige read:feature",
      ...fromEnvelope(featureParamsSchema),
      responses: {
        200: jsonResponse("Feature encontrada", featureViews.default),
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
      },
    },
  },
};

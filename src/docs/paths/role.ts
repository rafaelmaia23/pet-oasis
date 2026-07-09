import { z } from "zod";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import { roleViews } from "@/modules/role/role.presenter";
import { roleParamsSchema } from "@/modules/role/role.schema";
import { errorResponses, jsonResponse } from "../components";
import { fromEnvelope } from "../helpers";

export const rolePaths: ZodOpenApiPathsObject = {
  "/roles": {
    get: {
      tags: ["Roles"],
      summary: "Lista os papéis do sistema — exige read:role",
      responses: {
        200: jsonResponse("Catálogo de papéis", z.array(roleViews.default)),
        401: errorResponses[401],
        403: errorResponses[403],
      },
    },
  },
  "/roles/{id}": {
    get: {
      tags: ["Roles"],
      summary: "Busca um papel por id — exige read:role",
      ...fromEnvelope(roleParamsSchema),
      responses: {
        200: jsonResponse("Papel encontrado", roleViews.default),
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
      },
    },
  },
};

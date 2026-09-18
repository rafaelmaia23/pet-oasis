import type { ZodOpenApiPathsObject } from "zod-openapi";
import { meViews } from "@/modules/me/me.presenter";
import { errorResponses, jsonResponse } from "../components";

export const mePaths: ZodOpenApiPathsObject = {
  "/me": {
    get: {
      tags: ["Me"],
      summary: "Perfil do próprio usuário com as features efetivas",
      responses: {
        200: jsonResponse("Perfil do usuário autenticado", meViews.default),
        401: errorResponses[401],
        403: errorResponses[403],
      },
    },
  },
};

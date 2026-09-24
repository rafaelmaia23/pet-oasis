import { meViews } from "../me/me.views";
import { errorResponses } from "./responses";
import type { RouteGroup } from "./route.types";

export const meRoutes = {
  get: {
    method: "GET",
    path: "/me",
    tag: "Me",
    auth: "bearer",
    summary: "Perfil do próprio usuário com as features efetivas",
    responses: {
      200: {
        description: "Perfil do usuário autenticado",
        view: meViews.default,
      },
    },
    errors: { 401: errorResponses[401], 403: errorResponses[403] },
  },
} as const satisfies RouteGroup;

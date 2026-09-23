import { staticList } from "../pagination/list-envelope";
import { listBreedsSchema } from "../pet/breed.schema";
import { breedViews } from "../pet/breed.views";
import { errorResponses } from "./responses";
import type { RouteGroup } from "./route.types";

export const breedRoutes = {
  list: {
    method: "GET",
    path: "/breeds",
    tag: "Breeds",
    auth: "public",
    summary: "Lista as raças do catálogo — rota pública",
    request: listBreedsSchema,
    responses: {
      200: {
        description: "Catálogo de raças",
        view: staticList(breedViews.default),
      },
    },
    errors: { 422: errorResponses[422] },
  },
} satisfies RouteGroup;

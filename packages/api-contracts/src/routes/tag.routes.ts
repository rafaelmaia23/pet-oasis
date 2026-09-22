import {
  createTagSchema,
  tagParamsSchema,
  updateTagSchema,
} from "../catalog/tag.schema";
import { tagViews } from "../catalog/tag.views";
import { staticList } from "../pagination/list-envelope";
import { errorResponses, noContent } from "./responses";
import type { RouteGroup } from "./route.types";

export const tagRoutes = {
  list: {
    method: "GET",
    path: "/tags",
    tag: "Tags",
    auth: "public",
    summary: "Lista as tags do catálogo — rota pública",
    description:
      "Responde sem token. Sem paginação (`meta {}`), ordenada por nome.",
    responses: {
      200: {
        description: "Tags do catálogo",
        view: staticList(tagViews.default),
      },
    },
    errors: { 429: errorResponses[429] },
  },
  create: {
    method: "POST",
    path: "/tags",
    tag: "Tags",
    auth: "bearer",
    summary: "Cria uma tag — exige manage:catalog-structure",
    description:
      "O `slug` é derivado do nome e congelado depois. Nome e slug são únicos.",
    request: createTagSchema,
    responses: { 201: { description: "Tag criada", view: tagViews.default } },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      409: errorResponses[409],
      422: errorResponses[422],
    },
  },
  update: {
    method: "PATCH",
    path: "/tags/:tagId",
    tag: "Tags",
    auth: "bearer",
    summary: "Atualiza uma tag — exige manage:catalog-structure",
    request: updateTagSchema,
    responses: {
      200: { description: "Tag atualizada", view: tagViews.default },
    },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
      409: errorResponses[409],
      422: errorResponses[422],
    },
  },
  delete: {
    method: "DELETE",
    path: "/tags/:tagId",
    tag: "Tags",
    auth: "bearer",
    summary: "Exclui uma tag — exige manage:catalog-structure",
    description:
      "**Hard delete**, ao contrário de marca e categoria: a linha some e o nome volta a ficar livre. Rótulo transversal não participa de venda, então não há histórico a preservar.",
    request: tagParamsSchema,
    responses: { 204: noContent },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
      422: errorResponses[422],
    },
  },
} satisfies RouteGroup;

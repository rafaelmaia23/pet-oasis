import {
  brandParamsSchema,
  createBrandSchema,
  updateBrandSchema,
} from "../catalog/brand.schema";
import { brandViews } from "../catalog/brand.views";
import { staticList } from "../pagination/list-envelope";
import { errorResponses, noContent } from "./responses";
import type { RouteGroup } from "./route.types";

const SLUG_NOTE =
  "O `slug` é derivado do nome na criação e **congelado** depois: renomear a marca não muda a URL pública. Para mudá-lo, mande o campo `slug` explicitamente.";

export const brandRoutes = {
  list: {
    method: "GET",
    path: "/brands",
    tag: "Brands",
    auth: "public",
    summary: "Lista as marcas do catálogo — rota pública",
    description:
      "Responde sem token (a vitrine é pública). Sem paginação (`meta {}`): a taxonomia é conjunto pequeno e estável. Marca excluída não aparece.",
    responses: {
      200: {
        description: "Marcas do catálogo",
        view: staticList(brandViews.default),
      },
    },
    errors: { 429: errorResponses[429] },
  },
  create: {
    method: "POST",
    path: "/brands",
    tag: "Brands",
    auth: "bearer",
    summary: "Cria uma marca — exige manage:catalog-structure",
    description: `${SLUG_NOTE} Nome e slug são únicos globalmente, inclusive contra marcas excluídas — recriar uma marca apagada devolve 409.`,
    request: createBrandSchema,
    responses: {
      201: { description: "Marca criada", view: brandViews.default },
    },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      409: errorResponses[409],
      422: errorResponses[422],
    },
  },
  update: {
    method: "PATCH",
    path: "/brands/:brandId",
    tag: "Brands",
    auth: "bearer",
    summary: "Atualiza uma marca — exige manage:catalog-structure",
    description: SLUG_NOTE,
    request: updateBrandSchema,
    responses: {
      200: { description: "Marca atualizada", view: brandViews.default },
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
    path: "/brands/:brandId",
    tag: "Brands",
    auth: "bearer",
    summary: "Exclui uma marca — exige manage:catalog-structure",
    description:
      "Soft delete: a linha permanece e continua ocupando o nome e o slug.",
    request: brandParamsSchema,
    responses: { 204: noContent },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
      422: errorResponses[422],
    },
  },
  setLogo: {
    method: "PUT",
    path: "/brands/:brandId/logo",
    tag: "Brands",
    auth: "bearer",
    summary: "Define o logo da marca — exige manage:catalog-structure",
    description:
      "Valor **único**: `PUT` substitui o logo anterior e apaga o arquivo antigo. Devolve a marca. `PATCH /brands/{brandId}` recusa `logoPath` no corpo, então o upload é o único caminho.",
    request: brandParamsSchema,
    upload: "image",
    responses: {
      200: {
        description: "Marca com o logo atualizado",
        view: brandViews.default,
      },
    },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
      413: errorResponses[413],
      422: errorResponses[422],
      429: errorResponses[429],
    },
  },
  deleteLogo: {
    method: "DELETE",
    path: "/brands/:brandId/logo",
    tag: "Brands",
    auth: "bearer",
    summary: "Remove o logo da marca — exige manage:catalog-structure",
    description:
      "Apaga o arquivo e limpa a coluna. **Idempotente**: marca sem logo responde 204.",
    request: brandParamsSchema,
    responses: { 204: noContent },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
      422: errorResponses[422],
    },
  },
} satisfies RouteGroup;

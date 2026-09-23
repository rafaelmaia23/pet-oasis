import {
  categoryParamsSchema,
  createCategorySchema,
  updateCategorySchema,
} from "../catalog/category.schema";
import { categoryViews } from "../catalog/category.views";
import { staticList } from "../pagination/list-envelope";
import { errorResponses, noContent } from "./responses";
import type { RouteGroup } from "./route.types";

const TREE_NOTE =
  "A árvore tem no máximo **3 níveis** (`Alimentação > Ração > Ração seca`). `parentId` inexistente, excluído, igual ao próprio id, apontando para uma descendente, ou que estouraria a profundidade — inclusive porque o nó movido carrega filhos junto — são 422.";

export const categoryRoutes = {
  list: {
    method: "GET",
    path: "/categories",
    tag: "Categories",
    auth: "public",
    summary: "Lista a árvore de categorias — rota pública",
    description:
      "Responde sem token e devolve a **árvore aninhada**: `data` traz as raízes, com as filhas em `children`, ordenadas por `position` e depois por nome. Não pagina — cortar uma árvore no meio devolveria filhos sem pai.",
    responses: {
      200: {
        description: "Árvore de categorias",
        view: staticList(categoryViews.default),
      },
    },
    errors: { 429: errorResponses[429] },
  },
  create: {
    method: "POST",
    path: "/categories",
    tag: "Categories",
    auth: "bearer",
    summary: "Cria uma categoria — exige manage:catalog-structure",
    description: `${TREE_NOTE} O \`slug\` é derivado do nome e congelado depois; como ele é único globalmente, duas categorias homônimas em ramos diferentes colidem em 409 — informe \`slug\` para contornar.`,
    request: createCategorySchema,
    responses: {
      201: { description: "Categoria criada", view: categoryViews.default },
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
    path: "/categories/:categoryId",
    tag: "Categories",
    auth: "bearer",
    summary: "Atualiza uma categoria — exige manage:catalog-structure",
    description: `${TREE_NOTE} \`parentId: null\` promove a categoria (e a subárvore dela) ao nível raiz. A resposta é o nó, com \`children\` vazio — releia \`GET /categories\` para a árvore atualizada.`,
    request: updateCategorySchema,
    responses: {
      200: { description: "Categoria atualizada", view: categoryViews.default },
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
    path: "/categories/:categoryId",
    tag: "Categories",
    auth: "bearer",
    summary: "Exclui uma categoria — exige manage:catalog-structure",
    description:
      "Soft delete, e só de folha: categoria com subcategoria ativa devolve **409**. Não há cascata nem reparenting — apagar um pai não pode sumir com uma subárvore inteira sem o staff perceber.",
    request: categoryParamsSchema,
    responses: { 204: noContent },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
      409: errorResponses[409],
      422: errorResponses[422],
    },
  },
} as const satisfies RouteGroup;

import {
  categoryParamsSchema,
  categoryViews,
  createCategorySchema,
  updateCategorySchema,
} from "@pet-oasis/api-contracts/catalog";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import {
  errorResponses,
  jsonResponse,
  noContentResponse,
  staticList,
} from "../components";
import { fromEnvelope } from "../helpers";

const TREE_NOTE =
  "A árvore tem no máximo **3 níveis** (`Alimentação > Ração > Ração seca`). `parentId` inexistente, excluído, igual ao próprio id, apontando para uma descendente, ou que estouraria a profundidade — inclusive porque o nó movido carrega filhos junto — são 422.";

export const categoryPaths: ZodOpenApiPathsObject = {
  "/categories": {
    get: {
      tags: ["Categories"],
      summary: "Lista a árvore de categorias — rota pública",
      description:
        "Responde sem token e devolve a **árvore aninhada**: `data` traz as raízes, com as filhas em `children`, ordenadas por `position` e depois por nome. Não pagina — cortar uma árvore no meio devolveria filhos sem pai.",
      security: [],
      responses: {
        200: jsonResponse(
          "Árvore de categorias",
          staticList(categoryViews.default),
        ),
        429: errorResponses[429],
      },
    },
    post: {
      tags: ["Categories"],
      summary: "Cria uma categoria — exige manage:catalog-structure",
      description: `${TREE_NOTE} O \`slug\` é derivado do nome e congelado depois; como ele é único globalmente, duas categorias homônimas em ramos diferentes colidem em 409 — informe \`slug\` para contornar.`,
      ...fromEnvelope(createCategorySchema),
      responses: {
        201: jsonResponse("Categoria criada", categoryViews.default),
        401: errorResponses[401],
        403: errorResponses[403],
        409: errorResponses[409],
        422: errorResponses[422],
      },
    },
  },
  "/categories/{categoryId}": {
    patch: {
      tags: ["Categories"],
      summary: "Atualiza uma categoria — exige manage:catalog-structure",
      description: `${TREE_NOTE} \`parentId: null\` promove a categoria (e a subárvore dela) ao nível raiz. A resposta é o nó, com \`children\` vazio — releia \`GET /categories\` para a árvore atualizada.`,
      ...fromEnvelope(updateCategorySchema),
      responses: {
        200: jsonResponse("Categoria atualizada", categoryViews.default),
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
        409: errorResponses[409],
        422: errorResponses[422],
      },
    },
    delete: {
      tags: ["Categories"],
      summary: "Exclui uma categoria — exige manage:catalog-structure",
      description:
        "Soft delete, e só de folha: categoria com subcategoria ativa devolve **409**. Não há cascata nem reparenting — apagar um pai não pode sumir com uma subárvore inteira sem o staff perceber.",
      ...fromEnvelope(categoryParamsSchema),
      responses: {
        204: noContentResponse,
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
        409: errorResponses[409],
        422: errorResponses[422],
      },
    },
  },
};

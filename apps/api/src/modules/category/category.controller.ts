import {
  categoryParamsSchema,
  updateCategorySchema,
} from "@pet-oasis/api-contracts/catalog";
import type { routes } from "@pet-oasis/api-contracts/routes";
import type { Request, Response } from "express";
import { listEnvelope } from "@/lib/pagination";
import type { RouteHandler } from "@/lib/registerRoute";
import { categoryPresenter } from "./category.presenter";
import * as categoryService from "./category.service";

export const listCategories: RouteHandler<
  typeof routes.category.list
> = async () => {
  // Sem paginação (9.6/W7): árvore não é paginável — cortar no meio devolveria
  // filhos sem pai. `data` traz as raízes, com as filhas aninhadas.
  const tree = await categoryService.getCategoryTree();

  return listEnvelope(tree);
};

export const createCategory: RouteHandler<
  typeof routes.category.create
> = async ({ body }) => {
  const category = await categoryService.createCategory(body);

  // O recurso recém-criado é sempre folha, então `children` sai vazio.
  return { ...category, children: [] };
};

export const updateCategory = async (req: Request, res: Response) => {
  const { params, body } = updateCategorySchema.parse({
    params: req.params,
    body: req.body,
  });

  const category = await categoryService.updateCategory(
    params.categoryId,
    body,
  );

  // O `PATCH` responde o nó, não a subárvore: quem quiser a árvore atualizada
  // relê `GET /categories`, que é a rota que a monta.
  return res
    .status(200)
    .json(categoryPresenter.present({ ...category, children: [] }, "default"));
};

export const deleteCategory = async (req: Request, res: Response) => {
  const { params } = categoryParamsSchema.parse({ params: req.params });

  await categoryService.deleteCategory(params.categoryId);

  return res.status(204).send();
};

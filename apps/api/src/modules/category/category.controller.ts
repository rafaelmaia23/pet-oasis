import {
  categoryParamsSchema,
  createCategorySchema,
  updateCategorySchema,
} from "@pet-oasis/api-contracts/catalog";
import type { Request, Response } from "express";
import { listEnvelope } from "@/lib/pagination";
import { categoryPresenter } from "./category.presenter";
import * as categoryService from "./category.service";

export const listCategories = async (_req: Request, res: Response) => {
  const tree = await categoryService.getCategoryTree();

  // Sem paginação (9.6/W7): árvore não é paginável — cortar no meio devolveria
  // filhos sem pai. `data` traz as raízes, com as filhas aninhadas.
  res
    .status(200)
    .json(listEnvelope(categoryPresenter.presentMany(tree, "default")));
};

export const createCategory = async (req: Request, res: Response) => {
  const { body } = createCategorySchema.parse({ body: req.body });

  const category = await categoryService.createCategory(body);

  // O recurso recém-criado é sempre folha, então `children` sai vazio.
  return res
    .status(201)
    .json(categoryPresenter.present({ ...category, children: [] }, "default"));
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

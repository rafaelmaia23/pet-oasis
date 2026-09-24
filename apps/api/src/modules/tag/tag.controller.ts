import {
  createTagSchema,
  tagParamsSchema,
  updateTagSchema,
} from "@pet-oasis/api-contracts/catalog";
import type { routes } from "@pet-oasis/api-contracts/routes";
import type { Request, Response } from "express";
import { listEnvelope } from "@/lib/pagination";
import type { RouteHandler } from "@/lib/registerRoute";
import { tagPresenter } from "./tag.presenter";
import * as tagService from "./tag.service";

export const listTags: RouteHandler<typeof routes.tag.list> = async () => {
  const tags = await tagService.getTags();

  return listEnvelope(tags);
};

export const createTag = async (req: Request, res: Response) => {
  const { body } = createTagSchema.parse({ body: req.body });

  const tag = await tagService.createTag(body);

  return res.status(201).json(tagPresenter.present(tag, "default"));
};

export const updateTag = async (req: Request, res: Response) => {
  const { params, body } = updateTagSchema.parse({
    params: req.params,
    body: req.body,
  });

  const tag = await tagService.updateTag(params.tagId, body);

  return res.status(200).json(tagPresenter.present(tag, "default"));
};

export const deleteTag = async (req: Request, res: Response) => {
  const { params } = tagParamsSchema.parse({ params: req.params });

  await tagService.deleteTag(params.tagId);

  return res.status(204).send();
};

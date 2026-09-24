import { tagParamsSchema } from "@pet-oasis/api-contracts/catalog";
import type { routes } from "@pet-oasis/api-contracts/routes";
import type { Request, Response } from "express";
import { listEnvelope } from "@/lib/pagination";
import type { RouteHandler } from "@/lib/registerRoute";
import * as tagService from "./tag.service";

export const listTags: RouteHandler<typeof routes.tag.list> = async () => {
  const tags = await tagService.getTags();

  return listEnvelope(tags);
};

export const createTag: RouteHandler<typeof routes.tag.create> = ({ body }) =>
  tagService.createTag(body);

export const updateTag: RouteHandler<typeof routes.tag.update> = ({
  params,
  body,
}) => tagService.updateTag(params.tagId, body);

export const deleteTag = async (req: Request, res: Response) => {
  const { params } = tagParamsSchema.parse({ params: req.params });

  await tagService.deleteTag(params.tagId);

  return res.status(204).send();
};

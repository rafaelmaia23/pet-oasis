import type { Request, Response } from "express";
import { asyncHandler } from "@/utils/asyncHandler";
import { rolePresenter } from "./role.presenter";
import { roleParamsSchema } from "./role.schema";
import * as roleService from "./role.service";

export const getAllRoles = asyncHandler(async (_: Request, res: Response) => {
  const roles = await roleService.getAllRoles();

  return res.status(200).json(rolePresenter.presentMany(roles, "default"));
});

export const getRoleById = asyncHandler(async (req: Request, res: Response) => {
  const { params } = roleParamsSchema.parse({ params: req.params });

  const role = await roleService.getRoleById(params.id);

  return res.status(200).json(rolePresenter.present(role, "default"));
});

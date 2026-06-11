import type { Request, Response } from "express";
import { asyncHandler } from "@/utils/asyncHandler";
import { getAuthUser } from "@/utils/getAuthUser";
import { userPresenter } from "./user.presenter";
import {
  createUserSchema,
  updateUserSchema,
  userParamsSchema,
} from "./user.schema";
import * as userService from "./user.service";
import { resolveUserView } from "./user.view-resolver";

export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const { body } = createUserSchema.parse({ body: req.body });

  const user = await userService.createUser(body);

  return res
    .status(201)
    .json(userPresenter.present(user, resolveUserView(getAuthUser(req))));
});

export const getAllUsers = asyncHandler(async (req: Request, res: Response) => {
  const users = await userService.getAllUsers();

  return res.status(200).json(userPresenter.presentMany(users, "admin"));
});

export const getUserById = asyncHandler(async (req: Request, res: Response) => {
  const { params } = userParamsSchema.parse({ params: req.params });

  const authUser = getAuthUser(req);

  const user = await userService.getUserById(authUser, params.id);

  return res
    .status(200)
    .json(userPresenter.present(user, resolveUserView(authUser)));
});

export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const { params, body } = updateUserSchema.parse({
    params: req.params,
    body: req.body,
  });

  const user = await userService.updateUser(getAuthUser(req), params.id, body);

  return res
    .status(200)
    .json(userPresenter.present(user, resolveUserView(getAuthUser(req))));
});

export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  const { params } = userParamsSchema.parse({ params: req.params });

  await userService.deleteUser(getAuthUser(req), params.id);

  return res.status(204).send();
});

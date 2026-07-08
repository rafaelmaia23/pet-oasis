import type { Request, Response } from "express";
import { getAuthUser } from "@/utils/getAuthUser";
import { userPresenter } from "./user.presenter";
import {
  banUserSchema,
  createEmployeeSchema,
  updateUserSchema,
  userParamsSchema,
} from "./user.schema";
import * as userService from "./user.service";
import { resolveUserView } from "./user.view-resolver";

export const createEmployee = async (req: Request, res: Response) => {
  const { body } = createEmployeeSchema.parse({ body: req.body });

  const user = await userService.createEmployee(body);

  return res
    .status(201)
    .json(userPresenter.present(user, resolveUserView(getAuthUser(req))));
};

export const getAllUsers = async (_: Request, res: Response) => {
  const users = await userService.getAllUsers();

  return res.status(200).json(userPresenter.presentMany(users, "admin"));
};

export const getUserById = async (req: Request, res: Response) => {
  const { params } = userParamsSchema.parse({ params: req.params });

  const authUser = getAuthUser(req);

  const user = await userService.getUserById(authUser, params.id);

  return res
    .status(200)
    .json(userPresenter.present(user, resolveUserView(authUser)));
};

export const updateUser = async (req: Request, res: Response) => {
  const { params, body } = updateUserSchema.parse({
    params: req.params,
    body: req.body,
  });

  const user = await userService.updateUser(getAuthUser(req), params.id, body);

  return res
    .status(200)
    .json(userPresenter.present(user, resolveUserView(getAuthUser(req))));
};

export const deleteUser = async (req: Request, res: Response) => {
  const { params } = userParamsSchema.parse({ params: req.params });

  await userService.deleteUser(getAuthUser(req), params.id);

  return res.status(204).send();
};

export const banUser = async (req: Request, res: Response) => {
  const { params, body } = banUserSchema.parse({
    params: req.params,
    body: req.body,
  });

  await userService.banUser(getAuthUser(req).id, params.id, body.reason);

  return res.status(204).send();
};

export const unbanUser = async (req: Request, res: Response) => {
  const { params } = userParamsSchema.parse({ params: req.params });

  await userService.unbanUser(getAuthUser(req).id, params.id);

  return res.status(204).send();
};

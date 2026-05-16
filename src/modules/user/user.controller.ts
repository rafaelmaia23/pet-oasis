import type { Request, Response } from "express";
import { asyncHandler } from "@/utils/asyncHandler";
import {
  createUserSchema,
  updateUserSchema,
  userParamsSchema,
} from "./user.schema";
import * as userService from "./user.service";

export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const { body } = createUserSchema.parse({ body: req.body });

  const user = await userService.createUser(body);

  res.status(201).json(user);
});

export const getAllUsers = asyncHandler(
  async (_req: Request, res: Response) => {
    const users = await userService.getAllUsers();

    res.status(200).json(users);
  },
);

export const getUserById = asyncHandler(async (req: Request, res: Response) => {
  const { params } = userParamsSchema.parse({ params: req.params });

  const user = await userService.getUserById(params.id);

  res.status(200).json(user);
});

export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const { params, body } = updateUserSchema.parse({
    params: req.params,
    body: req.body,
  });

  // TODO: verificar autorização (own/any) via módulo authorization antes de chamar o service

  const updatedUser = await userService.updateUser(params.id, body);

  res.status(200).json(updatedUser);
});

export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  const { params } = userParamsSchema.parse({ params: req.params });

  // TODO: verificar autorização (own/any) via módulo authorization antes de chamar o service

  await userService.deleteUser(params.id);

  res.status(204).send();
});

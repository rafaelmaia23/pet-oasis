import type { routes } from "@pet-oasis/api-contracts/routes";
import {
  createEmployeeSchema,
  forcePasswordResetSchema,
  updateUserSchema,
  userParamsSchema,
} from "@pet-oasis/api-contracts/user";
import type { Request, Response } from "express";
import { offsetEnvelope } from "@/lib/pagination";
import type { RouteHandler } from "@/lib/registerRoute";
import { getAuthUser } from "@/utils/getAuthUser";
import { userPresenter } from "./user.presenter";
import * as userService from "./user.service";
import { resolveUserView } from "./user.view-resolver";

export const createEmployee = async (req: Request, res: Response) => {
  const { body } = createEmployeeSchema.parse({ body: req.body });

  const user = await userService.createEmployee(getAuthUser(req).id, body);

  return res
    .status(201)
    .json(userPresenter.present(user, resolveUserView(getAuthUser(req))));
};

export const getAllUsers: RouteHandler<typeof routes.user.list> = async ({
  query,
}) => {
  const { users, total } = await userService.getAllUsers(query);

  return offsetEnvelope(users, query, total);
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

export const deleteUser: RouteHandler<typeof routes.user.delete> = async ({
  params,
  actor,
}) => {
  await userService.deleteUser(actor, params.id);
};

export const banUser: RouteHandler<typeof routes.user.ban> = async ({
  params,
  body,
  actor,
}) => {
  await userService.banUser(actor.id, params.id, body.reason);
};

export const unbanUser: RouteHandler<typeof routes.user.unban> = async ({
  params,
  actor,
}) => {
  await userService.unbanUser(actor.id, params.id);
};

export const unlockAccount: RouteHandler<typeof routes.user.unlock> = async ({
  params,
  actor,
}) => {
  await userService.unlockAccount(actor.id, params.id);
};

export const reactivateAccount: RouteHandler<
  typeof routes.user.reactivate
> = async ({ params, body, actor }) => {
  await userService.reactivateAccount(actor.id, params.id, {
    profiles: body.profiles,
    ...(body.roleNames && { roleNames: body.roleNames }),
  });
};

export const forcePasswordReset = async (req: Request, res: Response) => {
  const { params } = forcePasswordResetSchema.parse({ params: req.params });

  await userService.forcePasswordReset(getAuthUser(req).id, params.id);

  return res.status(204).send();
};

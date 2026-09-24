import type { routes } from "@pet-oasis/api-contracts/routes";
import { offsetEnvelope } from "@/lib/pagination";
import type { RouteHandler } from "@/lib/registerRoute";
import * as userService from "./user.service";

export const createEmployee: RouteHandler<typeof routes.user.create> = async ({
  body,
  actor,
}) => userService.createEmployee(actor.id, body);

export const getAllUsers: RouteHandler<typeof routes.user.list> = async ({
  query,
}) => {
  const { users, total } = await userService.getAllUsers(query);

  return offsetEnvelope(users, query, total);
};

export const getUserById: RouteHandler<typeof routes.user.get> = async ({
  params,
  actor,
}) => userService.getUserById(actor, params.id);

export const updateUser: RouteHandler<typeof routes.user.update> = async ({
  params,
  body,
  actor,
}) => userService.updateUser(actor, params.id, body);

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

export const forcePasswordReset: RouteHandler<
  typeof routes.user.forcePasswordReset
> = async ({ params, actor }) => {
  await userService.forcePasswordReset(actor.id, params.id);
};

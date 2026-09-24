import type { routes } from "@pet-oasis/api-contracts/routes";
import {
  createCustomerProfileSchema,
  createEmployeeProfileSchema,
} from "@pet-oasis/api-contracts/user";
import type { Request, Response } from "express";
import type { RouteHandler } from "@/lib/registerRoute";
import { getAuthUser } from "@/utils/getAuthUser";
import { userPresenter } from "../user.presenter";
import { resolveUserView } from "../user.view-resolver";
import * as userProfileService from "./user.profile.service";

export const createCustomerProfile = async (req: Request, res: Response) => {
  const { params, body } = createCustomerProfileSchema.parse({
    params: req.params,
    body: req.body,
  });

  const response = await userProfileService.createCustomerProfile(
    getAuthUser(req),
    params.userId,
    body,
  );

  return res
    .status(201)
    .json(userPresenter.present(response, resolveUserView(getAuthUser(req))));
};

export const createEmployeeProfile = async (req: Request, res: Response) => {
  const { params, body } = createEmployeeProfileSchema.parse({
    params: req.params,
    body: req.body,
  });

  const response = await userProfileService.createEmployeeProfile(
    getAuthUser(req),
    params.userId,
    body,
  );

  return res
    .status(201)
    .json(userPresenter.present(response, resolveUserView(getAuthUser(req))));
};

export const deleteCustomerProfile: RouteHandler<
  typeof routes.profile.deleteCustomer
> = async ({ params }) => {
  await userProfileService.deleteCustomerProfile(params.userId);
};

export const deleteEmployeeProfile: RouteHandler<
  typeof routes.profile.deleteEmployee
> = async ({ params }) => {
  await userProfileService.deleteEmployeeProfile(params.userId);
};

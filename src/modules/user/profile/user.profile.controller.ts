import type { Request, Response } from "express";
import { getAuthUser } from "@/utils/getAuthUser";
import { userPresenter } from "../user.presenter";
import { resolveUserView } from "../user.view-resolver";
import {
  createCustomerProfileSchema,
  createEmployeeProfileSchema,
  deleteCustomerProfileSchema,
  deleteEmployeeProfileSchema,
} from "./user.profile.schema";
import * as userProfileService from "./user.profile.service";

export const createCustomerProfile = async (req: Request, res: Response) => {
  const { params, body } = createCustomerProfileSchema.parse({
    params: req.params,
    body: req.body,
  });

  const response = await userProfileService.createCustomerProfile(
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
    params.userId,
    body,
  );

  return res
    .status(201)
    .json(userPresenter.present(response, resolveUserView(getAuthUser(req))));
};

export const deleteCustomerProfile = async (req: Request, res: Response) => {
  const { params } = deleteCustomerProfileSchema.parse({
    params: req.params,
  });

  await userProfileService.deleteCustomerProfile(params.userId);

  return res.status(204).send();
};

export const deleteEmployeeProfile = async (req: Request, res: Response) => {
  const { params } = deleteEmployeeProfileSchema.parse({
    params: req.params,
  });

  await userProfileService.deleteEmployeeProfile(params.userId);

  return res.status(204).send();
};

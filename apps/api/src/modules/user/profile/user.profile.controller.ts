import type { routes } from "@pet-oasis/api-contracts/routes";
import type { RouteHandler } from "@/lib/registerRoute";
import * as userProfileService from "./user.profile.service";

export const createCustomerProfile: RouteHandler<
  typeof routes.profile.createCustomer
> = async ({ params, body, actor }) =>
  userProfileService.createCustomerProfile(actor, params.userId, body);

export const createEmployeeProfile: RouteHandler<
  typeof routes.profile.createEmployee
> = async ({ params, body, actor }) =>
  userProfileService.createEmployeeProfile(actor, params.userId, body);

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

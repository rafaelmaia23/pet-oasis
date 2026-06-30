import { Router } from "express";
import { canAccess } from "@/middlewares/canAccess.middleware";
import * as userProfileController from "./user.profile.controller";

const userProfileRouter = Router({ mergeParams: true });

userProfileRouter.post(
  "/customer",
  canAccess("create:profile"),
  userProfileController.createCustomerProfile,
);

userProfileRouter.post(
  "/employee",
  canAccess("create:profile"),
  userProfileController.createEmployeeProfile,
);

userProfileRouter.delete(
  "/customer",
  canAccess("delete:profile"),
  userProfileController.deleteCustomerProfile,
);

userProfileRouter.delete(
  "/employee",
  canAccess("delete:profile"),
  userProfileController.deleteEmployeeProfile,
);

export default userProfileRouter;

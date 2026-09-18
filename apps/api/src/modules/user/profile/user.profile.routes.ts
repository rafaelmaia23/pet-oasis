import { Router } from "express";
import { canAccess } from "@/middlewares/canAccess.middleware";
import * as userProfileController from "./user.profile.controller";

const userProfileRouter = Router({ mergeParams: true });

// A mesma rota cria **ou** reativa (§5.1) — o ramo é decidido pelo estado do
// perfil no banco, então o porteiro tem de admitir quem pode fazer qualquer um
// dos dois. Quem cobra a feature certa para o ramo que de fato correu é o
// service; sem isso, ter só `reactivate:` deixaria criar do zero.
userProfileRouter.post(
  "/customer",
  canAccess(["create:customer-profile", "reactivate:customer-profile"]),
  userProfileController.createCustomerProfile,
);

userProfileRouter.post(
  "/employee",
  canAccess(["create:employee-profile", "reactivate:employee-profile"]),
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

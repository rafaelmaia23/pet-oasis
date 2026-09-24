import { Router } from "express";
import { canAccess } from "@/middlewares/canAccess.middleware";
import * as petController from "./pet.controller";

/**
 * A coleção continua aninhada porque ali o pai é genuinamente parte da
 * identificação: é *onde* o pet nasce. `mergeParams` para enxergar o
 * `:customerId` do ponto de montagem.
 *
 * `:customerId` é o id do **perfil** (`Customer.id`, o mesmo que `GET /me`
 * devolve), não o do usuário — por isso o service resolve o dono no banco antes
 * de decidir escopo.
 */
const petCustomerRouter = Router({ mergeParams: true });

petCustomerRouter.get(
  "/pets",
  canAccess("read:pet"),
  petController.listCustomerPets,
);

export default petCustomerRouter;

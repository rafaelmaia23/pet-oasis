import { Router } from "express";
import { canAccess } from "@/middlewares/canAccess.middleware";
import * as petController from "./pet.controller";

/**
 * Recurso **plano** (`/pets/:petId`), coleção aninhada
 * (`/customers/:customerId/pets`, ver `pet.customer.routes.ts`): `petId` é UUID
 * global, então repetir o `customerId` no item seria redundante — e redundante
 * significa que pode **discordar** do dono real, obrigando a inventar uma regra
 * para um caso que só existe porque a rota o criou.
 *
 * As features vão na forma base (`read:pet`/`manage:pet`): `can()` já admite o
 * sufixo `:others`, e quem separa dono de staff é o `pet.service`.
 */
const petRouter = Router();

petRouter.get("/:petId", canAccess("read:pet"), petController.getPetById);

petRouter.patch("/:petId", canAccess("manage:pet"), petController.updatePet);

petRouter.delete("/:petId", canAccess("manage:pet"), petController.deletePet);

// Falecimento tem rota própria, no idioma de `POST`/`DELETE /users/:id/ban`:
// é transição de estado com significado (e ação de audit) próprios, não um
// campo de update. Feature: `manage:pet` comum — `deceasedAt` não destrói nada.
petRouter.post(
  "/:petId/deceased",
  canAccess("manage:pet"),
  petController.markPetDeceased,
);

petRouter.delete(
  "/:petId/deceased",
  canAccess("manage:pet"),
  petController.unmarkPetDeceased,
);

export default petRouter;

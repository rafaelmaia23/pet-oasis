import { routes } from "@pet-oasis/api-contracts/routes";
import { Router } from "express";
import { rateLimitByUser, uploadUserLimiter } from "@/lib/rateLimit";
import { registerRoute } from "@/lib/registerRoute";
import { authenticate } from "@/middlewares/authenticate.middleware";
import { canAccess } from "@/middlewares/canAccess.middleware";
import { uploadSingleImage } from "@/middlewares/upload.middleware";
import * as petController from "./pet.controller";

/**
 * O router **sem prefixo**: as rotas já declaradas num lugar só, com o path
 * inteiro vindo da entrada da tabela (`packages/api-contracts/src/routes/pet.routes.ts`).
 * Enquanto a migração corre (issue 12 de `.scratch/fase-12-module-depth/`), ele
 * convive com o `legacyPetRouter` abaixo, ainda montado em `/pets`. Os dois
 * nunca disputam um path: uma rota está numa forma ou na outra.
 */
const petRouter = Router();

registerRoute(petRouter, routes.pet.create, {
  before: [authenticate, canAccess("manage:pet")],
  handler: petController.createPet,
});

registerRoute(petRouter, routes.pet.listByCustomer, {
  before: [authenticate, canAccess("read:pet")],
  handler: petController.listCustomerPets,
});

// Única rota do módulo que exige a forma `:others` direto (como `GET /users`
// exige `read:user:others`): listar pet de terceiro é a definição dela, não um
// ramo que o service possa separar depois. Por isso o service não recebe ator.
registerRoute(petRouter, routes.pet.list, {
  before: [authenticate, canAccess("read:pet:others")],
  handler: petController.listPets,
});

registerRoute(petRouter, routes.pet.get, {
  before: [authenticate, canAccess("read:pet")],
  handler: petController.getPetById,
});

registerRoute(petRouter, routes.pet.update, {
  before: [authenticate, canAccess("manage:pet")],
  handler: petController.updatePet,
});

registerRoute(petRouter, routes.pet.delete, {
  before: [authenticate, canAccess("manage:pet")],
  handler: petController.deletePet,
});

// Falecimento tem rota própria, no idioma de `POST`/`DELETE /users/:id/ban`:
// é transição de estado com significado (e ação de audit) próprios, não um
// campo de update. Feature: `manage:pet` comum — `deceasedAt` não destrói nada.
registerRoute(petRouter, routes.pet.markDeceased, {
  before: [authenticate, canAccess("manage:pet")],
  handler: petController.markPetDeceased,
});

/**
 * A forma antiga, com o path partido entre o prefixo e a chamada.
 *
 * Recurso **plano** (`/pets/:petId`) — a coleção aninhada
 * (`/customers/:customerId/pets`) já saiu daqui, para o `petRouter` acima.
 * `petId` é UUID global, então repetir o `customerId` no item seria
 * redundante — e redundante significa que pode **discordar** do dono real,
 * obrigando a inventar uma regra para um caso que só existe porque a rota o
 * criou.
 *
 * As features vão na forma base (`read:pet`/`manage:pet`): `can()` já admite o
 * sufixo `:others`, e quem separa dono de staff é o `pet.service`.
 */
export const legacyPetRouter = Router();

/**
 * Foto (9.10). Valor **único** num endereço fixo, então `PUT` substitui e
 * `DELETE` limpa — não existe recurso "foto de pet" endereçável, e por isso a
 * resposta do `PUT` é a ficha do pet, não um objeto de imagem.
 *
 * Feature: `manage:pet` comum, na forma base (o `pet.service` separa dono de
 * staff). Não existe cargo que edite a ficha do pet mas não possa trocar a foto
 * — que é o critério de granularidade firmado na 9.1.
 */
legacyPetRouter.put(
  "/:petId/photo",
  canAccess("manage:pet"),
  rateLimitByUser(uploadUserLimiter, "image-upload"),
  uploadSingleImage,
  petController.updatePetPhoto,
);

legacyPetRouter.delete(
  "/:petId/photo",
  canAccess("manage:pet"),
  petController.deletePetPhoto,
);

legacyPetRouter.delete(
  "/:petId/deceased",
  canAccess("manage:pet"),
  petController.unmarkPetDeceased,
);

export default petRouter;

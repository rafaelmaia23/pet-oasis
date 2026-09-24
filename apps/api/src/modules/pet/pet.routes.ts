import { routes } from "@pet-oasis/api-contracts/routes";
import { Router } from "express";
import { rateLimitByUser, uploadUserLimiter } from "@/lib/rateLimit";
import { registerRoute } from "@/lib/registerRoute";
import { authenticate } from "@/middlewares/authenticate.middleware";
import { canAccess } from "@/middlewares/canAccess.middleware";
import { uploadSingleImage } from "@/middlewares/upload.middleware";
import * as petController from "./pet.controller";
import { petPhotoTransport } from "./pet.transport";

/**
 * As dez rotas de pet, montadas **sem prefixo**: o path inteiro (aninhado sob
 * `/customers/:customerId` na criação/listagem, plano em `/pets/...` no resto)
 * já vem da entrada da tabela (`packages/api-contracts/src/routes/pet.routes.ts`),
 * e o `authenticate` que ficava nos dois prefixos antigos
 * (`/customers/:customerId`, `/pets`) desceu para o `before` de cada rota.
 *
 * As features vão na forma base (`read:pet`/`manage:pet`): `can()` já admite o
 * sufixo `:others`, e quem separa dono de staff é o `pet.service` — via
 * `resolveCustomer`/`resolvePet` (fail-closed, dono fora da URL). A exceção é
 * a listagem geral, que exige a forma `:others` direto (como `GET /users`
 * exige `read:user:others`): listar pet de terceiro é a definição dela, não
 * um ramo que o service possa separar depois.
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

registerRoute(petRouter, routes.pet.unmarkDeceased, {
  before: [authenticate, canAccess("manage:pet")],
  handler: petController.unmarkPetDeceased,
});

/**
 * Foto (9.10). Valor **único** num endereço fixo, então `PUT` substitui e
 * `DELETE` limpa — não existe recurso "foto de pet" endereçável, e por isso a
 * resposta do `PUT` é a ficha do pet, não um objeto de imagem.
 *
 * Feature: `manage:pet` comum, na forma base (o `pet.service` separa dono de
 * staff). Não existe cargo que edite a ficha do pet mas não possa trocar a foto
 * — que é o critério de granularidade firmado na 9.1. Ordem do `before`
 * preservada: `canAccess` antes do limite por usuário, antes do `multer`.
 */
registerRoute(petRouter, routes.pet.setPhoto, {
  before: [
    authenticate,
    canAccess("manage:pet"),
    rateLimitByUser(uploadUserLimiter, "image-upload"),
    uploadSingleImage,
  ],
  context: petPhotoTransport,
  handler: petController.updatePetPhoto,
});

registerRoute(petRouter, routes.pet.deletePhoto, {
  before: [authenticate, canAccess("manage:pet")],
  handler: petController.deletePetPhoto,
});

export default petRouter;

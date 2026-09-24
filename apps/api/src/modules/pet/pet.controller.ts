import { petParamsSchema } from "@pet-oasis/api-contracts/pet";
import type { routes } from "@pet-oasis/api-contracts/routes";
import type { Request, Response } from "express";
import { listEnvelope, offsetEnvelope } from "@/lib/pagination";
import type { RouteHandler } from "@/lib/registerRoute";
import { uploadedFile } from "@/middlewares/upload.middleware";
import { getAuthUser } from "@/utils/getAuthUser";
import { petPresenter } from "./pet.presenter";
import * as petService from "./pet.service";

export const createPet: RouteHandler<typeof routes.pet.create> = async ({
  params,
  body,
  actor,
}) => petService.createPet(actor, params.customerId, body);

export const listCustomerPets: RouteHandler<
  typeof routes.pet.listByCustomer
> = async ({ params, actor }) => {
  const pets = await petService.getCustomerPets(actor, params.customerId);

  // Sem paginação: a coleção é limitada pelo dono (mesma classe de
  // `GET /users/:userId/roles`). O envelope existe mesmo assim para que
  // paginar amanhã seja aditivo, não breaking.
  return listEnvelope(pets);
};

export const listPets: RouteHandler<typeof routes.pet.list> = async ({
  query,
}) => {
  const { pets, total } = await petService.getAllPets(query);

  return offsetEnvelope(pets, query, total);
};

export const getPetById: RouteHandler<typeof routes.pet.get> = async ({
  params,
  actor,
}) => petService.getPetById(actor, params.petId);

export const updatePet: RouteHandler<typeof routes.pet.update> = async ({
  params,
  body,
  actor,
}) => petService.updatePet(actor, params.petId, body);

export const deletePet: RouteHandler<typeof routes.pet.delete> = async ({
  params,
  actor,
}) => {
  await petService.deletePet(actor, params.petId);
};

export const updatePetPhoto = async (req: Request, res: Response) => {
  const { params } = petParamsSchema.parse({ params: req.params });

  const pet = await petService.setPetPhoto(
    getAuthUser(req),
    params.petId,
    uploadedFile(req),
  );

  return res.status(200).json(petPresenter.present(pet, "default"));
};

export const deletePetPhoto = async (req: Request, res: Response) => {
  const { params } = petParamsSchema.parse({ params: req.params });

  await petService.removePetPhoto(getAuthUser(req), params.petId);

  return res.status(204).send();
};

export const markPetDeceased = async (req: Request, res: Response) => {
  const { params } = petParamsSchema.parse({ params: req.params });

  await petService.markPetDeceased(getAuthUser(req), params.petId);

  return res.status(204).send();
};

export const unmarkPetDeceased = async (req: Request, res: Response) => {
  const { params } = petParamsSchema.parse({ params: req.params });

  await petService.unmarkPetDeceased(getAuthUser(req), params.petId);

  return res.status(204).send();
};

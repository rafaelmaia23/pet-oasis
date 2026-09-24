import {
  listCustomerPetsSchema,
  listPetsSchema,
  petParamsSchema,
  updatePetSchema,
} from "@pet-oasis/api-contracts/pet";
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

export const listCustomerPets = async (req: Request, res: Response) => {
  const { params } = listCustomerPetsSchema.parse({ params: req.params });

  const pets = await petService.getCustomerPets(
    getAuthUser(req),
    params.customerId,
  );

  // Sem paginação: a coleção é limitada pelo dono (mesma classe de
  // `GET /users/:userId/roles`). O envelope existe mesmo assim para que
  // paginar amanhã seja aditivo, não breaking.
  res.status(200).json(listEnvelope(petPresenter.presentMany(pets, "default")));
};

export const listPets = async (req: Request, res: Response) => {
  const { query } = listPetsSchema.parse({ query: req.query });

  const { pets, total } = await petService.getAllPets(query);

  return res
    .status(200)
    .json(
      offsetEnvelope(petPresenter.presentMany(pets, "default"), query, total),
    );
};

export const getPetById = async (req: Request, res: Response) => {
  const { params } = petParamsSchema.parse({ params: req.params });

  const pet = await petService.getPetById(getAuthUser(req), params.petId);

  return res.status(200).json(petPresenter.present(pet, "default"));
};

export const updatePet = async (req: Request, res: Response) => {
  const { params, body } = updatePetSchema.parse({
    params: req.params,
    body: req.body,
  });

  const pet = await petService.updatePet(getAuthUser(req), params.petId, body);

  return res.status(200).json(petPresenter.present(pet, "default"));
};

export const deletePet = async (req: Request, res: Response) => {
  const { params } = petParamsSchema.parse({ params: req.params });

  await petService.deletePet(getAuthUser(req), params.petId);

  return res.status(204).send();
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

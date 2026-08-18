import type { Request, Response } from "express";
import { listEnvelope } from "@/lib/pagination";
import { getAuthUser } from "@/utils/getAuthUser";
import { petPresenter } from "./pet.presenter";
import {
  createPetSchema,
  listCustomerPetsSchema,
  petParamsSchema,
  updatePetSchema,
} from "./pet.schema";
import * as petService from "./pet.service";

export const createPet = async (req: Request, res: Response) => {
  const { params, body } = createPetSchema.parse({
    params: req.params,
    body: req.body,
  });

  const pet = await petService.createPet(
    getAuthUser(req),
    params.customerId,
    body,
  );

  return res.status(201).json(petPresenter.present(pet, "default"));
};

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

import { listBreedsSchema } from "@pet-oasis/api-contracts/pet";
import type { Request, Response } from "express";
import { listEnvelope } from "@/lib/pagination";
import { breedPresenter } from "./breed.presenter";
import * as breedService from "./breed.service";

export const listBreeds = async (req: Request, res: Response) => {
  const { query } = listBreedsSchema.parse({ query: req.query });

  const breeds = await breedService.getBreeds(query.species);

  // Sem paginação: catálogo de referência limitado, mesma classe de
  // `GET /roles` e `GET /features` (docs/adr/0004-pagination.md). O envelope existe
  // mesmo assim para que ganhar paginação amanhã seja aditivo, não breaking.
  res
    .status(200)
    .json(listEnvelope(breedPresenter.presentMany(breeds, "default")));
};

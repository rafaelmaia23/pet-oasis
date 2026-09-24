import type { routes } from "@pet-oasis/api-contracts/routes";
import { listEnvelope } from "@/lib/pagination";
import type { RouteHandler } from "@/lib/registerRoute";
import * as breedService from "./breed.service";

export const listBreeds: RouteHandler<typeof routes.breed.list> = async ({
  query,
}) => {
  const breeds = await breedService.getBreeds(query.species);

  // Sem paginação: catálogo de referência limitado, mesma classe de
  // `GET /roles` e `GET /features` (docs/adr/0004-pagination.md). O envelope existe
  // mesmo assim para que ganhar paginação amanhã seja aditivo, não breaking.
  return listEnvelope(breeds);
};

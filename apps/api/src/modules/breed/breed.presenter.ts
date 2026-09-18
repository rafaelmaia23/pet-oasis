import { z } from "zod";
import { PetSpecies } from "@/generated/prisma/enums";
import { createPresenter } from "@/utils/presenter";

// View única: raça é catálogo público, não tem campo sensível nem ramo por
// capability. `createdAt` fica de fora de propósito — é ruído para quem só
// quer popular um select.
const defaultView = z
  .object({
    id: z.uuid(),
    name: z.string().meta({ example: "Golden Retriever" }),
    species: z.enum(PetSpecies).meta({ example: PetSpecies.DOG }),
  })
  .meta({
    id: "Breed",
    description: "Raça de pet (catálogo de referência)",
  });

export const breedViews = {
  default: defaultView,
} as const;

export type BreedView = keyof typeof breedViews;

export const breedPresenter = createPresenter(breedViews);

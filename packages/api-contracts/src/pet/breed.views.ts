import { z } from "zod";
import { petSpeciesSchema } from "./pet.enums";

// View única: raça é catálogo público, não tem campo sensível nem ramo por
// capability. `createdAt` fica de fora de propósito — é ruído para quem só
// quer popular um select.
const defaultView = z
  .object({
    id: z.uuid(),
    name: z.string().meta({ example: "Golden Retriever" }),
    species: petSpeciesSchema.meta({ example: "DOG" }),
  })
  .meta({
    id: "Breed",
    description: "Raça de pet (catálogo de referência)",
  });

export const breedViews = {
  default: defaultView,
} as const;

export type BreedView = keyof typeof breedViews;

import { z } from "zod";
import { PetSpecies } from "@/generated/prisma/enums";

export const listBreedsSchema = z.object({
  query: z.object({
    // Opcional de propósito: sem o filtro a rota devolve o catálogo inteiro
    // (algumas centenas de linhas fixas), que é o que o seed fake e a coleção
    // Bruno consomem. Valor fora do enum morre aqui, em 422 nomeando
    // `species` — validação sintática, sem banco.
    species: z.enum(PetSpecies).optional().meta({
      description: "Filtra as raças por espécie",
      example: PetSpecies.DOG,
    }),
  }),
});

export type ListBreedsQuery = z.infer<typeof listBreedsSchema>["query"];

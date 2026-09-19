import { z } from "zod";

// Enums com dois donos (ver `src/user/index.ts`): o Prisma é dono do banco, o
// contrato do que atravessa a rede; o teste de paridade da API prova que os
// valores batem.

// Enum fechado, deliberadamente mais largo que o mínimo e **sem `OUTRO`** —
// `OUTRO` seria buraco permanente de qualidade de dado. Espécie nova entra nos
// dois donos ao mesmo tempo, e o teste de paridade é o que garante o "ao mesmo
// tempo". Espécie é também **faceta** do produto (`targetSpecies[]`), nunca
// nível da árvore de categorias.
export const petSpeciesSchema = z.enum([
  "DOG",
  "CAT",
  "RABBIT",
  "BIRD",
  "RODENT",
  "REPTILE",
  "FISH",
]);
export type PetSpecies = z.infer<typeof petSpeciesSchema>;

export const petSexSchema = z.enum(["MALE", "FEMALE", "UNKNOWN"]);
export type PetSex = z.infer<typeof petSexSchema>;

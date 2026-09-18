import type { PetSpecies } from "@/generated/prisma/enums";
import * as breedRepository from "./breed.repository";

// Repasse: nesta sessão não há regra semântica sobre raça. A validação
// espécie↔raça (espécie que exige raça sem raça, raça de outra espécie) mora no
// `pet.service` da 9.4, porque é o cadastro de pet que a dispara.
export async function getBreeds(species?: PetSpecies) {
  return breedRepository.getBreeds(species);
}

import { PetSpecies } from "@/generated/prisma/enums";

/**
 * Catálogo de raças — dado de **referência**, no mesmo idioma de
 * `DEFAULT_FEATURES`/`DEFAULT_ROLES`: declarado aqui, lido pelo seed, nunca
 * consultado em API de terceiro em runtime (disponibilidade refém de um
 * terceiro, sem id estável para FK, cobertura ruim fora de cão e gato).
 * Manutenção dali em diante é edição desta constante — raça de animal não muda
 * com frequência. Racional completo em `docs/adr/0006-pet-domain-modeling.md`.
 *
 * Mora em `src/modules/breed/` e não em `src/lib/seed/` porque
 * `SPECIES_WITH_BREED` é lida em **runtime** pelo `pet.service` (9.4): um
 * service de domínio importando do diretório de seed seria arquivo no lugar
 * errado. `src/lib/seed/` guarda dado fake/demo e rotinas, não o catálogo
 * canônico.
 */

/** Nome da linha "sem raça definida", semeada para toda espécie com raça. */
export const SRD_BREED_NAME = "SRD";

/**
 * Espécies que **exigem** `breedId` no cadastro de pet (a validação semântica
 * vive no `pet.service`, 9.4). Constante explícita de propósito — **não** é
 * derivada de "existe linha em `Breed` para esta espécie": no dia em que
 * alguém semear a primeira raça de peixe, todo pet-peixe já cadastrado
 * passaria retroativamente a violar a regra, sem que ninguém tenha mudado a
 * regra de fato.
 *
 * Só cão e gato (9.3). Em ave e roedor o que existe não é raça, é
 * espécie/variedade (calopsita, periquito; hamster sírio × anão russo) —
 * enfiar isso aqui misturaria dois conceitos e obrigaria todo dono de ave a
 * escolher um valor que não é raça. Incluir uma espécie nova é decisão
 * explícita, nunca automática.
 */
export const SPECIES_WITH_BREED = [
  PetSpecies.DOG,
  PetSpecies.CAT,
] as const satisfies readonly PetSpecies[];

export type SpeciesWithBreed = (typeof SPECIES_WITH_BREED)[number];

type BreedDefinition = {
  species: PetSpecies;
  name: string;
};

/**
 * Nomes em pt-BR, sem duplicata, ordenados alfabeticamente dentro de cada
 * espécie. A ordenação da resposta da API é responsabilidade da query, não
 * desta lista.
 *
 * O seed é idempotente pela chave `@@unique([species, name])` e **não**
 * reconcilia removidos: tirar uma raça daqui não a apaga do banco. A partir da
 * 9.4 `Pet.breedId` referencia estas linhas, e um `deleteMany` reconciliador
 * quebraria o boot do container no dia em que uma raça com pet saísse da
 * lista. Remoção de raça é migration deliberada.
 */
export const DEFAULT_BREEDS = [
  // ── Cães ───────────────────────────────────────────────────────────────
  { species: PetSpecies.DOG, name: "Afghan Hound" },
  { species: PetSpecies.DOG, name: "Airedale Terrier" },
  { species: PetSpecies.DOG, name: "Akita" },
  { species: PetSpecies.DOG, name: "American Bully" },
  { species: PetSpecies.DOG, name: "American Staffordshire Terrier" },
  { species: PetSpecies.DOG, name: "Basenji" },
  { species: PetSpecies.DOG, name: "Basset Hound" },
  { species: PetSpecies.DOG, name: "Beagle" },
  { species: PetSpecies.DOG, name: "Bearded Collie" },
  { species: PetSpecies.DOG, name: "Bedlington Terrier" },
  { species: PetSpecies.DOG, name: "Bernese Mountain Dog" },
  { species: PetSpecies.DOG, name: "Bichon Frisé" },
  { species: PetSpecies.DOG, name: "Bloodhound" },
  { species: PetSpecies.DOG, name: "Boiadeiro Australiano" },
  { species: PetSpecies.DOG, name: "Border Collie" },
  { species: PetSpecies.DOG, name: "Border Terrier" },
  { species: PetSpecies.DOG, name: "Borzoi" },
  { species: PetSpecies.DOG, name: "Boston Terrier" },
  { species: PetSpecies.DOG, name: "Bouvier des Flandres" },
  { species: PetSpecies.DOG, name: "Boxer" },
  { species: PetSpecies.DOG, name: "Buldogue Americano" },
  { species: PetSpecies.DOG, name: "Buldogue Francês" },
  { species: PetSpecies.DOG, name: "Buldogue Inglês" },
  { species: PetSpecies.DOG, name: "Bull Terrier" },
  { species: PetSpecies.DOG, name: "Bullmastiff" },
  { species: PetSpecies.DOG, name: "Cane Corso" },
  { species: PetSpecies.DOG, name: "Cavalier King Charles Spaniel" },
  { species: PetSpecies.DOG, name: "Chihuahua" },
  { species: PetSpecies.DOG, name: "Chow Chow" },
  { species: PetSpecies.DOG, name: "Cocker Spaniel Americano" },
  { species: PetSpecies.DOG, name: "Cocker Spaniel Inglês" },
  { species: PetSpecies.DOG, name: "Collie" },
  { species: PetSpecies.DOG, name: "Coton de Tuléar" },
  { species: PetSpecies.DOG, name: "Dachshund" },
  { species: PetSpecies.DOG, name: "Dálmata" },
  { species: PetSpecies.DOG, name: "Doberman" },
  { species: PetSpecies.DOG, name: "Dogue Alemão" },
  { species: PetSpecies.DOG, name: "Dogue Argentino" },
  { species: PetSpecies.DOG, name: "Dogue de Bordeaux" },
  { species: PetSpecies.DOG, name: "Fila Brasileiro" },
  { species: PetSpecies.DOG, name: "Fox Terrier" },
  { species: PetSpecies.DOG, name: "Galgo Español" },
  { species: PetSpecies.DOG, name: "Golden Retriever" },
  { species: PetSpecies.DOG, name: "Greyhound" },
  { species: PetSpecies.DOG, name: "Griffon de Bruxelas" },
  { species: PetSpecies.DOG, name: "Husky Siberiano" },
  { species: PetSpecies.DOG, name: "Jack Russell Terrier" },
  { species: PetSpecies.DOG, name: "Komondor" },
  { species: PetSpecies.DOG, name: "Kuvasz" },
  { species: PetSpecies.DOG, name: "Labradoodle" },
  { species: PetSpecies.DOG, name: "Labrador Retriever" },
  { species: PetSpecies.DOG, name: "Lhasa Apso" },
  { species: PetSpecies.DOG, name: "Lulu da Pomerânia" },
  { species: PetSpecies.DOG, name: "Malamute do Alasca" },
  { species: PetSpecies.DOG, name: "Maltês" },
  { species: PetSpecies.DOG, name: "Mastiff Inglês" },
  { species: PetSpecies.DOG, name: "Mastim Napolitano" },
  { species: PetSpecies.DOG, name: "Mastim Tibetano" },
  { species: PetSpecies.DOG, name: "Norfolk Terrier" },
  { species: PetSpecies.DOG, name: "Old English Sheepdog" },
  { species: PetSpecies.DOG, name: "Papillon" },
  { species: PetSpecies.DOG, name: "Pastor Alemão" },
  { species: PetSpecies.DOG, name: "Pastor Australiano" },
  { species: PetSpecies.DOG, name: "Pastor Belga Malinois" },
  { species: PetSpecies.DOG, name: "Pastor Branco Suíço" },
  { species: PetSpecies.DOG, name: "Pastor de Shetland" },
  { species: PetSpecies.DOG, name: "Pequinês" },
  { species: PetSpecies.DOG, name: "Pinscher Miniatura" },
  { species: PetSpecies.DOG, name: "Pit Bull Terrier" },
  { species: PetSpecies.DOG, name: "Podengo Português" },
  { species: PetSpecies.DOG, name: "Pointer Inglês" },
  { species: PetSpecies.DOG, name: "Poodle" },
  { species: PetSpecies.DOG, name: "Pug" },
  { species: PetSpecies.DOG, name: "Rhodesian Ridgeback" },
  { species: PetSpecies.DOG, name: "Rottweiler" },
  { species: PetSpecies.DOG, name: "Saluki" },
  { species: PetSpecies.DOG, name: "Samoieda" },
  { species: PetSpecies.DOG, name: "São Bernardo" },
  { species: PetSpecies.DOG, name: "Schnauzer Gigante" },
  { species: PetSpecies.DOG, name: "Schnauzer Miniatura" },
  { species: PetSpecies.DOG, name: "Schnauzer Standard" },
  { species: PetSpecies.DOG, name: "Setter Irlandês" },
  { species: PetSpecies.DOG, name: "Sharpei" },
  { species: PetSpecies.DOG, name: "Shiba Inu" },
  { species: PetSpecies.DOG, name: "Shih Tzu" },
  { species: PetSpecies.DOG, name: "Spitz Japonês" },
  { species: PetSpecies.DOG, name: "SRD" },
  { species: PetSpecies.DOG, name: "Staffordshire Bull Terrier" },
  { species: PetSpecies.DOG, name: "Terra Nova" },
  { species: PetSpecies.DOG, name: "Terrier Brasileiro" },
  { species: PetSpecies.DOG, name: "Weimaraner" },
  { species: PetSpecies.DOG, name: "Welsh Corgi Cardigan" },
  { species: PetSpecies.DOG, name: "Welsh Corgi Pembroke" },
  { species: PetSpecies.DOG, name: "West Highland White Terrier" },
  { species: PetSpecies.DOG, name: "Whippet" },
  { species: PetSpecies.DOG, name: "Yorkshire Terrier" },

  // ── Gatos ──────────────────────────────────────────────────────────────
  { species: PetSpecies.CAT, name: "Abissínio" },
  { species: PetSpecies.CAT, name: "American Curl" },
  { species: PetSpecies.CAT, name: "American Shorthair" },
  { species: PetSpecies.CAT, name: "Angorá Turco" },
  { species: PetSpecies.CAT, name: "Azul Russo" },
  { species: PetSpecies.CAT, name: "Balinês" },
  { species: PetSpecies.CAT, name: "Bengal" },
  { species: PetSpecies.CAT, name: "Birmanês" },
  { species: PetSpecies.CAT, name: "Bobtail Japonês" },
  { species: PetSpecies.CAT, name: "Bombaim" },
  { species: PetSpecies.CAT, name: "British Longhair" },
  { species: PetSpecies.CAT, name: "British Shorthair" },
  { species: PetSpecies.CAT, name: "Burmês" },
  { species: PetSpecies.CAT, name: "Chartreux" },
  { species: PetSpecies.CAT, name: "Cornish Rex" },
  { species: PetSpecies.CAT, name: "Devon Rex" },
  { species: PetSpecies.CAT, name: "Egyptian Mau" },
  { species: PetSpecies.CAT, name: "Exótico de Pelo Curto" },
  { species: PetSpecies.CAT, name: "Gato do Bosque da Noruega" },
  { species: PetSpecies.CAT, name: "Havana Brown" },
  { species: PetSpecies.CAT, name: "Himalaio" },
  { species: PetSpecies.CAT, name: "Korat" },
  { species: PetSpecies.CAT, name: "LaPerm" },
  { species: PetSpecies.CAT, name: "Maine Coon" },
  { species: PetSpecies.CAT, name: "Manx" },
  { species: PetSpecies.CAT, name: "Munchkin" },
  { species: PetSpecies.CAT, name: "Ocicat" },
  { species: PetSpecies.CAT, name: "Oriental de Pelo Curto" },
  { species: PetSpecies.CAT, name: "Persa" },
  { species: PetSpecies.CAT, name: "Peterbald" },
  { species: PetSpecies.CAT, name: "Pixie-bob" },
  { species: PetSpecies.CAT, name: "Ragamuffin" },
  { species: PetSpecies.CAT, name: "Ragdoll" },
  { species: PetSpecies.CAT, name: "Sagrado da Birmânia" },
  { species: PetSpecies.CAT, name: "Savannah" },
  { species: PetSpecies.CAT, name: "Scottish Fold" },
  { species: PetSpecies.CAT, name: "Selkirk Rex" },
  { species: PetSpecies.CAT, name: "Siamês" },
  { species: PetSpecies.CAT, name: "Siberiano" },
  { species: PetSpecies.CAT, name: "Singapura" },
  { species: PetSpecies.CAT, name: "Somali" },
  { species: PetSpecies.CAT, name: "Sphynx" },
  { species: PetSpecies.CAT, name: "SRD" },
  { species: PetSpecies.CAT, name: "Tonquinês" },
  { species: PetSpecies.CAT, name: "Toyger" },
  { species: PetSpecies.CAT, name: "Van Turco" },
] as const satisfies readonly BreedDefinition[];

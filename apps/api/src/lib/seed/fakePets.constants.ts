import type { PetSex, PetSpecies } from "@/generated/prisma/enums";
import type { FakeImageKey } from "./fakeImages.constants";
import { fakeEmail } from "./fakeUsers.constants";

/**
 * Roster declarativo dos pets fake (flag `SEED_FAKE_DATA`), amarrado aos
 * customers de `FAKE_USER_ROSTER` pelo **email fixo** — nunca por id, que muda
 * a cada banco recriado.
 *
 * A chave de idempotência é `(ownerEmail, name)`, e não o `microchipId`: parte
 * do roster existe justamente para exercitar o pet **sem** microchip. O chip,
 * quando existe, é unique **global** e vale para a linha soft-deletada (9.4/U1),
 * então os números precisam ser distintos entre si — reusar um faria o rerun
 * colidir em constraint depois de o pet ser excluído.
 *
 * A raça é resolvida por **nome** sobre o catálogo já semeado (`Breed` é dado de
 * referência, 9.3), nunca por id fixo. Cão e gato exigem raça; as demais
 * espécies a proíbem, e é por isso que `breedName` é `null` no coelho e no
 * hamster.
 */

export type FakePetTrait = "NONE" | "DECEASED" | "SOFT_DELETED";

export type FakePet = {
  /** Slug do dono no `FAKE_USER_ROSTER` — resolvido para email por `fakeEmail`. */
  ownerSlug: string;
  name: string;
  species: PetSpecies;
  /** Nome da raça no catálogo semeado; `null` para espécie que proíbe raça. */
  breedName: string | null;
  sex: PetSex;
  /** `null` é o cenário "pet sem microchip". */
  microchipId: string | null;
  /** `null` é o cenário "pet sem foto". */
  photo: FakeImageKey | null;
  trait: FakePetTrait;
  color?: string;
  weightGrams?: number;
  neutered?: boolean;
  birthDate?: string;
  birthDateIsEstimated?: boolean;
  /** Obrigatório quando `trait` é `DECEASED`; data fixa, para o seed ser determinístico. */
  deceasedAt?: string;
  notes?: string;
};

/** O email do dono, para o seed casar o pet com o customer já criado. */
export function fakePetOwnerEmail(pet: FakePet): string {
  return fakeEmail(pet.ownerSlug);
}

/**
 * 15 pets em 12 donos. `customer08` fica **sem pet nenhum** de propósito — lista
 * vazia é um estado que a API responde e a UI precisa tratar, e um roster em que
 * todo cliente tem pet nunca o produz.
 *
 * Cenários deliberados (9.11/AB9), todos garantidos por teste:
 * - `customer01` com **três** pets, para a listagem aninhada ter o que paginar;
 * - `Rex` **falecido** (`deceasedAt`) — some da lista viva, permanece no
 *   histórico (9.4);
 * - `Fumaça` **soft-deletado** por si;
 * - `Pipoca` (coelho) e `Tofu` (hamster) em espécie **sem raça**;
 * - `Amora` e `Tofu` **sem microchip**;
 * - pets em donos de cenário: `banned-customer` (o ban não mexe no pet) e
 *   `deleted-user`, cujo pet herda o `deletedAt` do dono — nunca existe filho
 *   ativo de pai morto (Fase 8).
 */
export const FAKE_PET_ROSTER: FakePet[] = [
  {
    ownerSlug: "customer01",
    name: "Thor",
    species: "DOG",
    breedName: "Golden Retriever",
    sex: "MALE",
    microchipId: "981098100000001",
    photo: "pet-cao-1",
    trait: "NONE",
    color: "Dourado",
    weightGrams: 32000,
    neutered: true,
    birthDate: "2020-04-18",
  },
  {
    ownerSlug: "customer01",
    name: "Mel",
    species: "DOG",
    breedName: "Beagle",
    sex: "FEMALE",
    microchipId: "981098100000002",
    photo: "pet-cao-2",
    trait: "NONE",
    color: "Tricolor",
    weightGrams: 11500,
    neutered: true,
    birthDate: "2022-09-02",
  },
  {
    ownerSlug: "customer01",
    name: "Nina",
    species: "CAT",
    breedName: "Siamês",
    sex: "FEMALE",
    microchipId: "981098100000003",
    photo: "pet-gato-1",
    trait: "NONE",
    color: "Seal point",
    weightGrams: 3900,
    neutered: true,
    birthDate: "2023-01-27",
  },
  {
    // Sem foto: a vitrine e a listagem precisam saber renderizar a ausência.
    ownerSlug: "customer02",
    name: "Bidu",
    species: "DOG",
    breedName: "SRD",
    sex: "MALE",
    microchipId: "981098100000004",
    photo: null,
    trait: "NONE",
    color: "Caramelo",
    weightGrams: 18700,
    neutered: false,
    birthDate: "2019-11-05",
    birthDateIsEstimated: true,
    notes: "Adotado na feira do bairro; data de nascimento estimada.",
  },
  {
    // Sem microchip.
    ownerSlug: "customer03",
    name: "Amora",
    species: "CAT",
    breedName: "Persa",
    sex: "FEMALE",
    microchipId: null,
    photo: "pet-gato-2",
    trait: "NONE",
    color: "Creme",
    weightGrams: 4200,
    neutered: true,
    birthDate: "2021-06-14",
  },
  {
    // Espécie que **proíbe** raça (9.4): `breedName` null.
    ownerSlug: "customer04",
    name: "Pipoca",
    species: "RABBIT",
    breedName: null,
    sex: "FEMALE",
    microchipId: "981098100000005",
    photo: "pet-coelho",
    trait: "NONE",
    color: "Branco e cinza",
    weightGrams: 1800,
    neutered: false,
  },
  {
    // Espécie sem raça **e** sem microchip.
    ownerSlug: "customer05",
    name: "Tofu",
    species: "RODENT",
    breedName: null,
    sex: "MALE",
    microchipId: null,
    photo: "pet-hamster",
    trait: "NONE",
    color: "Bege",
    weightGrams: 120,
    neutered: false,
  },
  {
    // Falecido: sai da lista viva, permanece no histórico.
    ownerSlug: "customer06",
    name: "Rex",
    species: "DOG",
    breedName: "Pastor Alemão",
    sex: "MALE",
    microchipId: "981098100000006",
    photo: null,
    trait: "DECEASED",
    deceasedAt: "2024-10-02",
    color: "Preto e marrom",
    weightGrams: 38000,
    neutered: true,
    birthDate: "2012-03-09",
  },
  {
    // Soft-deletado por si (erro de cadastro), com o dono vivo.
    ownerSlug: "customer07",
    name: "Fumaça",
    species: "CAT",
    breedName: "SRD",
    sex: "UNKNOWN",
    microchipId: "981098100000007",
    photo: null,
    trait: "SOFT_DELETED",
    color: "Cinza",
  },
  {
    ownerSlug: "hybrid01",
    name: "Bolinha",
    species: "DOG",
    breedName: "Poodle",
    sex: "FEMALE",
    microchipId: "981098100000008",
    photo: null,
    trait: "NONE",
    color: "Branco",
    weightGrams: 7200,
    neutered: true,
    birthDate: "2021-12-30",
  },
  {
    ownerSlug: "hybrid02",
    name: "Simba",
    species: "CAT",
    breedName: "Maine Coon",
    sex: "MALE",
    microchipId: "981098100000009",
    photo: null,
    trait: "NONE",
    color: "Rajado marrom",
    weightGrams: 7600,
    neutered: true,
    birthDate: "2020-08-21",
  },
  {
    ownerSlug: "hybrid03",
    name: "Zeca",
    species: "DOG",
    breedName: "Buldogue Francês",
    sex: "MALE",
    microchipId: "981098100000010",
    photo: null,
    trait: "NONE",
    color: "Fawn",
    weightGrams: 12400,
    neutered: false,
    birthDate: "2023-05-11",
  },
  {
    // Dono com email não verificado: o pet existe, o dono é que não entra.
    ownerSlug: "pending-customer",
    name: "Luna",
    species: "DOG",
    breedName: "Border Collie",
    sex: "FEMALE",
    microchipId: "981098100000011",
    photo: null,
    trait: "NONE",
    color: "Preto e branco",
    weightGrams: 16800,
    neutered: true,
    birthDate: "2022-02-17",
  },
  {
    // Dono banido: o ban é do usuário, não do pet — o registro segue ativo.
    ownerSlug: "banned-customer",
    name: "Duque",
    species: "DOG",
    breedName: "Rottweiler",
    sex: "MALE",
    microchipId: "981098100000012",
    photo: null,
    trait: "NONE",
    color: "Preto e ferrugem",
    weightGrams: 47000,
    neutered: false,
    birthDate: "2019-07-04",
  },
  {
    // Dono soft-deletado: o pet herda o `deletedAt` do dono no seed, porque
    // nunca existe filho ativo de pai morto (Fase 8).
    ownerSlug: "deleted-user",
    name: "Pretinha",
    species: "CAT",
    breedName: "SRD",
    sex: "FEMALE",
    microchipId: "981098100000013",
    photo: null,
    trait: "NONE",
    color: "Preto",
    weightGrams: 3600,
    neutered: true,
  },
];

import { z } from "zod";
import { PetSex, PetSpecies } from "@/generated/prisma/enums";
import { createPresenter } from "@/utils/presenter";

/**
 * View única, sem resolver por capability — a ficha do pet não tem nenhum campo
 * que o funcionário veja e o dono não. Quem separa os dois é a autorização de
 * escopo (`own` × `:others`), que decide *se* a ficha sai, não *quanto* dela.
 * Mesmo racional do `breed.presenter.ts`.
 *
 * `breed` sai achatada: o Prisma aninha a junção, e a view espelha o formato
 * útil ao cliente (id + nome) em vez de repassar a linha inteira.
 */
const defaultView = z
  .object({
    id: z.uuid(),
    customerId: z.uuid(),
    name: z.string().meta({ example: "Bidu" }),
    species: z.enum(PetSpecies).meta({ example: PetSpecies.DOG }),
    breed: z
      .object({ id: z.uuid(), name: z.string() })
      .nullable()
      .meta({ description: "Raça, quando a espécie a exige" }),
    sex: z.enum(PetSex),
    birthDate: z.coerce.date().nullable(),
    birthDateIsEstimated: z.boolean(),
    weightGrams: z.int().nullable().meta({ example: 8400 }),
    neutered: z.boolean(),
    microchipId: z.string().nullable(),
    color: z.string().nullable(),
    notes: z.string().nullable(),
    photoPath: z.string().nullable(),
    // Separado de `deletedAt` de propósito: pet falecido continua aparecendo.
    deceasedAt: z.coerce.date().nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .meta({
    id: "Pet",
    description: "Pet de um cliente",
  });

export const petViews = {
  default: defaultView,
} as const;

export type PetView = keyof typeof petViews;

export const petPresenter = createPresenter(petViews);

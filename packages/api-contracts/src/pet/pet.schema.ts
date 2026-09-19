import { z } from "zod";
import { buildOffsetQuerySchema, defineSortConfig } from "../pagination";
import { petSexSchema, petSpeciesSchema } from "./pet.enums";

/**
 * Validação **sintática** do pet — forma, tipo e faixa, sem banco. As três
 * regras de espécie×raça são semânticas (precisam consultar `Breed`) e vivem no
 * `pet.service`; aqui `breedId` é só "uuid, se vier".
 */

const nameSchema = z
  .string()
  .min(1, "Name is required")
  .max(60, "Name must be at most 60 characters")
  .meta({ example: "Bidu" });

/** Extraído porque também é filtro de `GET /pets` (lá sem o `nullable`). */
const microchipIdSchema = z
  .string()
  .min(1, "Microchip ID cannot be empty")
  .max(50, "Microchip ID must be at most 50 characters");

const petFieldsSchema = z.object({
  name: nameSchema,
  species: petSpeciesSchema.meta({
    description: "Espécie do pet",
    example: "DOG",
  }),
  breedId: z.uuid("Invalid breed ID").nullable().optional().meta({
    description:
      "Raça (obrigatória para cão e gato, proibida nas demais espécies)",
  }),
  sex: petSexSchema.optional().meta({ example: "MALE" }),
  birthDate: z.coerce
    .date()
    .nullable()
    .optional()
    .meta({ description: "Data de nascimento", example: "2021-03-14" }),
  birthDateIsEstimated: z.boolean().optional().meta({
    description: "Marca a data de nascimento como estimada (pet adotado)",
    example: false,
  }),
  weightGrams: z
    .int("Weight must be an integer number of grams")
    .positive("Weight must be greater than zero")
    .max(500_000, "Weight must be at most 500000 grams")
    .nullable()
    .optional()
    .meta({ description: "Peso em gramas (inteiro)", example: 8400 }),
  neutered: z.boolean().optional().meta({ example: false }),
  microchipId: microchipIdSchema
    .nullable()
    .optional()
    .meta({ description: "Número do microchip", example: "981098100123456" }),
  color: z
    .string()
    .min(1, "Color cannot be empty")
    .max(60, "Color must be at most 60 characters")
    .nullable()
    .optional()
    .meta({ example: "Caramelo" }),
  notes: z
    .string()
    .max(2000, "Notes must be at most 2000 characters")
    .nullable()
    .optional()
    .meta({ example: "Alérgico a frango." }),
});

export const customerParamsSchema = z.object({
  params: z.object({
    customerId: z.uuid("Invalid customer ID"),
  }),
});

export const petParamsSchema = z.object({
  params: z.object({
    petId: z.uuid("Invalid pet ID"),
  }),
});

export const createPetSchema = z.object({
  params: customerParamsSchema.shape.params,
  body: petFieldsSchema.strict(),
});

export const listCustomerPetsSchema = customerParamsSchema;

/**
 * Allowlist de ordenação de `GET /pets`. A direção declarada é a natural de cada
 * campo (usada quando vem `?sort=` sem `?order=`): data desce, texto sobe.
 *
 * `species` é enum do Postgres, então ordena pela **ordem de declaração** do
 * `PetSpecies` (cão, gato, coelho…), não alfabeticamente.
 */
export const PET_SORT = defineSortConfig({
  fields: { createdAt: "desc", name: "asc", species: "asc" },
  default: "createdAt",
});

/**
 * Listagem geral (staff). Filtros são **filtro**, não resolução de recurso:
 * `customerId`/`breedId` bem-formados que não existem devolvem lista vazia, e
 * não 404. `deceased` omitido traz vivos e falecidos — a lista de balcão limpa
 * é `?deceased=false`.
 */
export const listPetsSchema = z.object({
  query: buildOffsetQuerySchema(PET_SORT, {
    species: petSpeciesSchema
      .optional()
      .meta({ description: "Filtra pela espécie", example: "DOG" }),
    sex: petSexSchema
      .optional()
      .meta({ description: "Filtra pelo sexo", example: "MALE" }),
    customerId: z
      .uuid("Invalid customer ID")
      .optional()
      .meta({ description: "Filtra pelo id do perfil de cliente (dono)" }),
    breedId: z
      .uuid("Invalid breed ID")
      .optional()
      .meta({ description: "Filtra pela raça" }),
    microchipId: microchipIdSchema.optional().meta({
      description: "Busca exata pelo número do microchip",
      example: "981098100123456",
    }),
    neutered: z
      .stringbool({ truthy: ["true"], falsy: ["false"] })
      .optional()
      .meta({
        description: "true = apenas castrados; false = apenas não castrados",
        example: true,
      }),
    deceased: z
      .stringbool({ truthy: ["true"], falsy: ["false"] })
      .optional()
      .meta({
        description:
          "true = apenas falecidos; false = apenas vivos; omitido = ambos",
        example: false,
      }),
  }),
});

export const updatePetSchema = z.object({
  params: petParamsSchema.shape.params,
  body: petFieldsSchema
    .extend({
      // Transferir pet entre clientes é decisão de negócio própria (trilha de
      // auditoria + o que acontece com o histórico clínico), hoje no backlog.
      customerId: z.never("Pets cannot be transferred through this endpoint"),
      // Falecimento é evento, não campo: tem ação de audit própria
      // (`PET_DECEASED`) e rota própria, no idioma do ban.
      deceasedAt: z.never("Use POST /pets/:petId/deceased instead"),
      // Preenchido pelo upload (9.10), nunca por corpo de PATCH.
      photoPath: z.never("Photo is managed through the image upload endpoint"),
    })
    .strict()
    .partial()
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field must be provided for update",
    }),
});

export type CreatePetInput = z.infer<typeof createPetSchema>["body"];
export type UpdatePetInput = z.infer<typeof updatePetSchema>["body"];
export type ListPetsQuery = z.infer<typeof listPetsSchema>["query"];

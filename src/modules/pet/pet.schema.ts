import { z } from "zod";
import { PetSex, PetSpecies } from "@/generated/prisma/enums";

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

const petFieldsSchema = z.object({
  name: nameSchema,
  species: z.enum(PetSpecies).meta({
    description: "Espécie do pet",
    example: PetSpecies.DOG,
  }),
  breedId: z.uuid("Invalid breed ID").nullable().optional().meta({
    description:
      "Raça (obrigatória para cão e gato, proibida nas demais espécies)",
  }),
  sex: z.enum(PetSex).optional().meta({ example: PetSex.MALE }),
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
  microchipId: z
    .string()
    .min(1, "Microchip ID cannot be empty")
    .max(50, "Microchip ID must be at most 50 characters")
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

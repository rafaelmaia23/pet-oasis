import { z } from "zod";
import {
  buildOffsetQuerySchema,
  defineSortConfig,
} from "../pagination/pagination.schema";
import { ROLE_NAMES } from "../role/role.names";
import { profileKindSchema, userStatusSchema } from "./user.enums";

/**
 * Tetos de comprimento dos campos de identidade (10.13). Nenhuma coluna do
 * banco declara tamanho, então o teto é decidido aqui, pelo que o campo
 * representa, e vale para todo schema que reutiliza a peça — `auth`, perfil de
 * cliente e reativação incluídos. O limite total de corpo protege o agregado;
 * é o teto por campo que impede 99KB dentro de um único `email`.
 */

/** RFC 5321: caminho de até 256 octetos com os `<>` — maior que isso não é entregável. */
export const EMAIL_MAX_LENGTH = 254;
/** Teto do `passwordSchema`, reaplicado onde a senha é *conferida*: senha maior nunca foi gravada. */
export const PASSWORD_MAX_LENGTH = 100;
/** A máscara `000.000.000-00` — a normalização tira o resto, mas o texto cru tem teto. */
export const CPF_MAX_LENGTH = 14;
/** A máscara mais longa em uso, `+55 (11) 9 8765-4321` — o mesmo racional do CPF. */
export const PHONE_MAX_LENGTH = 20;

export const emailSchema = z
  .email("Invalid email address")
  .max(
    EMAIL_MAX_LENGTH,
    `Email must be at most ${EMAIL_MAX_LENGTH} characters`,
  );

/**
 * CPF e telefone chegam com máscara e são normalizados para dígitos antes da
 * regra de tamanho — por isso o `.max()` fica **antes** do `transform`: é o
 * texto cru que se limita, senão onze dígitos afogados em separadores passam.
 */
export const cpfSchema = z
  .string()
  .max(CPF_MAX_LENGTH, `CPF deve ter no máximo ${CPF_MAX_LENGTH} caracteres`)
  .transform((val) => val.replace(/\D/g, ""))
  .pipe(z.string().length(11, "CPF must be exactly 11 digits"))
  .meta({ description: "CPF (11 dígitos)", example: "12345678901" });

export const phoneSchema = z
  .string()
  .max(
    PHONE_MAX_LENGTH,
    `Telefone deve ter no máximo ${PHONE_MAX_LENGTH} caracteres`,
  )
  .transform((val) => val.replace(/\D/g, ""))
  .pipe(
    z
      .string()
      .regex(/^\d{10,11}$/, "Telefone deve ter 10 ou 11 dígitos (com DDD)"),
  )
  .meta({
    description: "Telefone com DDD (10-11 dígitos)",
    example: "11987654321",
  });

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters long")
  .max(
    PASSWORD_MAX_LENGTH,
    `Password must be at most ${PASSWORD_MAX_LENGTH} characters long`,
  )
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[@$!%*?&]/, "Password must contain at least one special character")
  .meta({
    description:
      "Senha forte: 8+ caracteres com maiúscula, minúscula, número e símbolo",
    example: "DemoOasis2026!",
  });

const userBodySchema = z.object({
  name: z
    .string()
    .min(2, "Name is required")
    .max(100, "Name must be less than 100 characters")
    .meta({ example: "Maria Silva" }),
  email: emailSchema.meta({ example: "maria@example.com" }),
  cpf: cpfSchema,
  password: passwordSchema,
});

export const createEmployeeSchema = z.object({
  body: userBodySchema.extend({
    roleNames: z
      .array(z.enum(ROLE_NAMES))
      .optional()
      .meta({
        description: "Papéis a atribuir (default: attendant)",
        example: ["attendant"],
      }),
  }),
});

export const createCustomerSchema = z.object({
  body: userBodySchema.extend({ phone: phoneSchema }),
});

export const updateUserSchema = z.object({
  params: z.object({
    id: z.uuid("Invalid user ID"),
  }),
  body: z
    .object({
      name: z
        .string()
        .min(2, "Name is required")
        .max(100, "Name must be less than 100 characters"),
      cpf: z.never("CPF cannot be updated through this endpoint"),
      email: z.never("Email cannot be updated through this endpoint"),
      password: z.never("Password cannot be updated through this endpoint"),
      roleNames: z.never("Roles cannot be updated through this endpoint"),
    })
    .strict()
    .partial()
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field must be provided for update",
    }),
});

export const userParamsSchema = z.object({
  params: z.object({
    id: z.uuid("Invalid user ID"),
  }),
});

export const forcePasswordResetSchema = userParamsSchema;

export const reactivateAccountSchema = z.object({
  params: z.object({
    id: z.uuid("Invalid user ID"),
  }),
  body: z.object({
    // `.min(1)` é o D14 no schema: uma conta ativa sem nenhum perfil ativo é
    // estado proibido, então escolher zero perfis nem chega ao service.
    profiles: z
      .array(profileKindSchema)
      .min(1, "Escolha ao menos um perfil para restaurar")
      .meta({
        description: "Perfis com que a conta volta",
        example: ["CUSTOMER"],
      }),
    // Omitido = default do D8 (todas as roles que morreram com cada perfil).
    // Nomeada, tem a semântica do K15/K21: é *com que roles a conta volta* —
    // restaura a que morreu naquela cascata, concede a que não morreu ali.
    roleNames: z
      .array(z.enum(ROLE_NAMES))
      .optional()
      .meta({
        description: "Roles com que a conta volta (default: as da cascata)",
        example: ["attendant"],
      }),
  }),
});

/**
 * Allowlist de ordenação de `GET /users`. A direção declarada é a natural de
 * cada campo (usada quando vem `?sort=` sem `?order=`): data desce, texto sobe.
 */
export const USER_SORT = defineSortConfig({
  fields: { createdAt: "desc", name: "asc", email: "asc" },
  default: "createdAt",
});

export const listUsersSchema = z.object({
  query: buildOffsetQuerySchema(USER_SORT, {
    status: userStatusSchema
      .optional()
      .meta({ description: "Filtra pelo status da conta", example: "ACTIVE" }),
    banned: z
      .stringbool({ truthy: ["true"], falsy: ["false"] })
      .optional()
      .meta({
        description: "true = apenas banidos; false = apenas não banidos",
        example: false,
      }),
    role: z
      .enum(ROLE_NAMES)
      .optional()
      .meta({ description: "Filtra por nome de role", example: "manager" }),
  }),
});

export const banUserSchema = z.object({
  params: z.object({
    id: z.uuid("Invalid user ID"),
  }),
  body: z.object({
    reason: z
      .string()
      .min(1, "Reason is required")
      .max(500, "Reason must be at most 500 characters")
      .meta({ example: "Violação dos termos de uso" }),
  }),
});

export type ListUsersQuery = z.infer<typeof listUsersSchema>["query"];
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>["body"];
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>["body"];
export type UpdateUserInput = z.infer<typeof updateUserSchema>["body"];
export type BanUserInput = z.infer<typeof banUserSchema>["body"];

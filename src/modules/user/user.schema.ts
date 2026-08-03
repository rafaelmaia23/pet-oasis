import { z } from "zod";
import { UserStatus } from "@/generated/prisma/enums";
import { offsetQuerySchema } from "@/lib/pagination";
import { ROLE_NAMES } from "@/modules/role/role.constants";

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters long")
  .max(100, "Password must be at most 100 characters long")
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
  email: z
    .email("Invalid email address")
    .meta({ example: "maria@example.com" }),
  cpf: z
    .string()
    .transform((val) => val.replace(/\D/g, ""))
    .pipe(z.string().length(11, "CPF must be exactly 11 digits"))
    .meta({ description: "CPF (11 dígitos)", example: "12345678901" }),
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
  body: userBodySchema.extend({
    phone: z
      .string()
      .transform((val) => val.replace(/\D/g, ""))
      .pipe(
        z
          .string()
          .regex(/^\d{10,11}$/, "Telefone deve ter 10 ou 11 dígitos (com DDD)"),
      )
      .meta({
        description: "Telefone com DDD (10-11 dígitos)",
        example: "11987654321",
      }),
  }),
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

export const listUsersSchema = z.object({
  query: offsetQuerySchema.extend({
    status: z
      .enum(UserStatus)
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

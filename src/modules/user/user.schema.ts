import { z } from "zod";
import { ROLE_NAMES } from "@/modules/role/role.constants";

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters long")
  .max(100, "Password must be at most 100 characters long")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[@$!%*?&]/, "Password must contain at least one special character");

const userBodySchema = z.object({
  name: z
    .string()
    .min(2, "Name is required")
    .max(100, "Name must be less than 100 characters"),
  email: z.email("Invalid email address"),
  cpf: z
    .string()
    .transform((val) => val.replace(/\D/g, ""))
    .pipe(z.string().length(11, "CPF must be exactly 11 digits")),
  password: passwordSchema,
});

export const createEmployeeSchema = z.object({
  body: userBodySchema.extend({
    roleNames: z.array(z.enum(ROLE_NAMES)).optional(),
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
      ),
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

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>["body"];
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>["body"];
export type UpdateUserInput = z.infer<typeof updateUserSchema>["body"];

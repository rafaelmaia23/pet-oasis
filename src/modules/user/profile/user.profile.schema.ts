import z from "zod";
import { ROLE_NAMES } from "@/modules/role/role.constants";

export const createCustomerProfileSchema = z.object({
  params: z.object({
    userId: z.uuid("ID do usuário inválido"),
  }),
  body: z.object({
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

export const createEmployeeProfileSchema = z.object({
  params: z.object({
    userId: z.uuid("ID do usuário inválido"),
  }),
  body: z.object({
    roleNames: z.array(z.enum(ROLE_NAMES)).optional(),
  }),
});

export const deleteCustomerProfileSchema = z.object({
  params: z.object({
    userId: z.uuid("ID do usuário inválido"),
  }),
});

export const deleteEmployeeProfileSchema = z.object({
  params: z.object({
    userId: z.uuid("ID do usuário inválido"),
  }),
});

export type CreateCustomerProfileInput = z.infer<
  typeof createCustomerProfileSchema
>["body"];

export type CreateEmployeeProfileInput = z.infer<
  typeof createEmployeeProfileSchema
>["body"];

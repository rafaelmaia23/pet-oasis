import { z } from "zod";
import { ROLE_NAMES } from "../role/role.names";
import { phoneSchema } from "./user.schema";

export const createCustomerProfileSchema = z.object({
  params: z.object({
    userId: z.uuid("ID do usuário inválido"),
  }),
  body: z.object({ phone: phoneSchema }),
});

export const createEmployeeProfileSchema = z.object({
  params: z.object({
    userId: z.uuid("ID do usuário inválido"),
  }),
  body: z.object({
    roleNames: z
      .array(z.enum(ROLE_NAMES))
      .optional()
      .meta({
        description: "Papéis a atribuir (default: attendant)",
        example: ["attendant"],
      }),
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

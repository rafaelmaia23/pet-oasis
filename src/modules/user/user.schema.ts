import { z } from "zod";

export const createUserSchema = z.object({
  body: z.object({
    name: z
      .string()
      .min(2, "Name is required")
      .max(100, "Name must be less than 100 characters"),
    email: z.email("Invalid email address"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters long")
      .max(100, "Password must be less than 100 characters")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[0-9]/, "Password must contain at least one number"),
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
      email: z.email("Invalid email address"),
      password: z.never("Password cannot be updated through this endpoint"),
    })
    .strict()
    .partial()
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field must be provided for update",
    }),
});

export const userParamsSchema = z.object({
  params: z.object({
    id: z.guid("Invalid user ID"),
  }),
});

export type CreateUserInput = z.infer<typeof createUserSchema>["body"];
export type UpdateUserInput = z.infer<typeof updateUserSchema>["body"];

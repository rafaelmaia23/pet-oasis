import { z } from "zod";
import { createCustomerSchema } from "../user/user.schema";

export const signupSchema = createCustomerSchema;

export const loginSchema = z.object({
  body: z.object({
    email: z.email("Invalid email address"),
    password: z.string().min(1, "Password is required"),
  }),
});

export const sessionParamsSchema = z.object({
  params: z.object({
    id: z.uuid("Invalid session ID"),
  }),
});

export type LoginInput = z.infer<typeof loginSchema>["body"];

export type SessionParams = z.infer<typeof sessionParamsSchema>["params"];

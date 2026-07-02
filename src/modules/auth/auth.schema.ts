import { z } from "zod";
import { createCustomerSchema } from "../user/user.schema";

export const signupSchema = createCustomerSchema;

export const loginSchema = z.object({
  body: z.object({
    email: z.email("Invalid email address"),
    password: z.string().min(1, "Password is required"),
  }),
});

export const refreshSessionSchema = z.object({
  body: z.object({
    sessionId: z.uuid("Invalid session ID"),
  }),
});

export type LoginInput = z.infer<typeof loginSchema>["body"];

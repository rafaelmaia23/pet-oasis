import { z } from "zod";
import { createCustomerSchema, passwordSchema } from "../user/user.schema";

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

export const verifyEmailSchema = z.object({
  body: z.object({
    token: z.string().min(1, "Token is required"),
  }),
});

export const resendVerificationSchema = z.object({
  body: z.object({
    email: z.email("Invalid email address"),
  }),
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.email("Invalid email address"),
  }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(1, "Token is required"),
    newPassword: passwordSchema,
  }),
});

export type LoginInput = z.infer<typeof loginSchema>["body"];

export type SessionParams = z.infer<typeof sessionParamsSchema>["params"];

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>["body"];

export type ResendVerificationInput = z.infer<
  typeof resendVerificationSchema
>["body"];

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>["body"];

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>["body"];

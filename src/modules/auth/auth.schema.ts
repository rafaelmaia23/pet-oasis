import { z } from "zod";
import { createCustomerSchema, passwordSchema } from "../user/user.schema";

export const signupSchema = createCustomerSchema;

export const loginSchema = z.object({
  body: z.object({
    email: z
      .email("Invalid email address")
      .meta({ example: "demo@petoasis.dev" }),
    password: z
      .string()
      .min(1, "Password is required")
      .meta({ example: "DemoOasis2026!" }),
  }),
});

export const sessionParamsSchema = z.object({
  params: z.object({
    id: z.uuid("Invalid session ID"),
  }),
});

export const verifyEmailSchema = z.object({
  body: z.object({
    token: z.string().min(1, "Token is required").meta({
      description: "Token recebido por email",
      example: "a1b2c3d4...",
    }),
  }),
});

export const resendVerificationSchema = z.object({
  body: z.object({
    email: z
      .email("Invalid email address")
      .meta({ example: "maria@example.com" }),
  }),
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: z
      .email("Invalid email address")
      .meta({ example: "maria@example.com" }),
  }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(1, "Token is required").meta({
      description: "Token de reset recebido por email",
      example: "a1b2c3d4...",
    }),
    newPassword: passwordSchema,
  }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z
      .string()
      .min(1, "Current password is required")
      .meta({ example: "SenhaAtual1!" }),
    newPassword: passwordSchema,
  }),
});

export const changeEmailSchema = z.object({
  body: z.object({
    currentPassword: z
      .string()
      .min(1, "Current password is required")
      .meta({ example: "SenhaAtual1!" }),
    newEmail: z
      .email("Invalid email address")
      .meta({ example: "novo@example.com" }),
  }),
});

export const confirmEmailChangeSchema = z.object({
  body: z.object({
    token: z.string().min(1, "Token is required").meta({
      description: "Token recebido por email",
      example: "a1b2c3d4...",
    }),
  }),
});

export const confirmAccountReactivationSchema = z.object({
  body: z.object({
    token: z.string().min(1, "Token is required").meta({
      description: "Token recebido por email",
      example: "a1b2c3d4...",
    }),
    newPassword: passwordSchema,
    phone: z
      .string()
      .transform((val) => val.replace(/\D/g, ""))
      .pipe(
        z
          .string()
          .regex(/^\d{10,11}$/, "Telefone deve ter 10 ou 11 dígitos (com DDD)"),
      )
      .optional()
      .meta({
        description:
          "Telefone com DDD — obrigatório apenas quando a reativação precisa criar um perfil de cliente do zero",
        example: "11987654321",
      }),
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

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>["body"];

export type ChangeEmailInput = z.infer<typeof changeEmailSchema>["body"];

export type ConfirmEmailChangeInput = z.infer<
  typeof confirmEmailChangeSchema
>["body"];

import { z } from "zod";
import {
  createCustomerSchema,
  emailSchema,
  PASSWORD_MAX_LENGTH,
  passwordSchema,
  phoneSchema,
} from "../user/user.schema";

export const signupSchema = createCustomerSchema;

/**
 * Comprimento do token opaco (verificação de email, reset de senha, troca de
 * email, reativação) em hex — é o que viaja na URL e volta no corpo. É contrato
 * porque é o teto dos campos `token` abaixo (10.13): um valor de outro tamanho
 * não pode casar com hash nenhum, então recusá-lo antes do banco não muda o
 * resultado — só o custo. Quem gera o token (na API) deriva os bytes daqui.
 */
export const OPAQUE_TOKEN_LENGTH = 64;

/**
 * Senha *conferida* (login, troca de senha, troca de email): só o que o
 * `passwordSchema` já limita é aceito aqui, e nada além — senha maior nunca foi
 * gravada, então também nunca vai bater (10.13). A força não se checa: quem
 * confere é o bcrypt.
 */
const presentedPassword = (requiredMessage: string) =>
  z
    .string()
    .min(1, requiredMessage)
    .max(
      PASSWORD_MAX_LENGTH,
      `Password must be at most ${PASSWORD_MAX_LENGTH} characters long`,
    );

/** Token opaco recebido por email — tem o tamanho que o gerador emite, e só ele. */
const tokenSchema = z
  .string()
  .min(1, "Token is required")
  .max(
    OPAQUE_TOKEN_LENGTH,
    `Token must be at most ${OPAQUE_TOKEN_LENGTH} characters`,
  );

export const loginSchema = z.object({
  body: z.object({
    email: emailSchema.meta({ example: "demo@petoasis.dev" }),
    password: presentedPassword("Password is required").meta({
      example: "DemoOasis2026!",
    }),
  }),
});

export const sessionParamsSchema = z.object({
  params: z.object({
    id: z.uuid("Invalid session ID"),
  }),
});

export const verifyEmailSchema = z.object({
  body: z.object({
    token: tokenSchema.meta({
      description: "Token recebido por email",
      example: "a1b2c3d4...",
    }),
  }),
});

export const resendVerificationSchema = z.object({
  body: z.object({
    email: emailSchema.meta({ example: "maria@example.com" }),
  }),
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: emailSchema.meta({ example: "maria@example.com" }),
  }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    token: tokenSchema.meta({
      description: "Token de reset recebido por email",
      example: "a1b2c3d4...",
    }),
    newPassword: passwordSchema,
  }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: presentedPassword("Current password is required").meta({
      example: "SenhaAtual1!",
    }),
    newPassword: passwordSchema,
  }),
});

export const changeEmailSchema = z.object({
  body: z.object({
    currentPassword: presentedPassword("Current password is required").meta({
      example: "SenhaAtual1!",
    }),
    newEmail: emailSchema.meta({ example: "novo@example.com" }),
  }),
});

export const confirmEmailChangeSchema = z.object({
  body: z.object({
    token: tokenSchema.meta({
      description: "Token recebido por email",
      example: "a1b2c3d4...",
    }),
  }),
});

export const confirmAccountReactivationSchema = z.object({
  body: z.object({
    token: tokenSchema.meta({
      description: "Token recebido por email",
      example: "a1b2c3d4...",
    }),
    newPassword: passwordSchema,
    phone: phoneSchema.optional().meta({
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

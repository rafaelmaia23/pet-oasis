import { z } from "zod";

const defaultView = z
  .object({
    id: z.uuid(),
    device: z.string().meta({ example: "Chrome no Windows" }),
    ipAddress: z.string().nullable().meta({ example: "203.0.113.42" }),
    createdAt: z.coerce.date(),
    expiresAt: z.coerce.date(),
    current: z
      .boolean()
      .meta({ description: "Se é a sessão da própria request atual" }),
  })
  .meta({
    id: "Session",
    description: "Sessão viva do usuário (uma linha por refresh token emitido)",
  });

export const sessionViews = { default: defaultView } as const;

export type SessionView = keyof typeof sessionViews;

// O que `POST /auth/login` e `POST /auth/refresh` respondem (11.16). O refresh
// token não está aqui de propósito: ele viaja em cookie, nunca no corpo.
const accessTokenView = z
  .object({
    accessToken: z
      .string()
      .meta({ example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }),
    expiresIn: z
      .int()
      .positive()
      .meta({
        example: 900,
        description:
          "Validade do access token em **segundos**, contada do recebimento " +
          "(convenção OAuth2). É daqui que o cliente lê quando renovar — nunca " +
          "do `exp` do JWT, que é da API",
      }),
  })
  .meta({
    id: "AccessToken",
    description: "Access token recém-emitido e por quanto tempo ele vale",
  });

export const accessTokenViews = { default: accessTokenView } as const;

export type AccessTokenView = keyof typeof accessTokenViews;

// A resposta genérica dos fluxos que não podem revelar se o email existe
// (reenvio de verificação, esqueci a senha) e do signup que caiu no ramo de
// reativação. Só uma frase para o usuário: qualquer campo a mais aqui viraria
// oráculo de existência de conta.
const messageView = z
  .object({ message: z.string() })
  .meta({ id: "MessageResponse" });

export const messageViews = { default: messageView } as const;

export type MessageView = keyof typeof messageViews;

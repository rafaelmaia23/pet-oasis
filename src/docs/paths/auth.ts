import { z } from "zod";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import { sessionViews } from "@/modules/auth/auth.presenter";
import {
  changeEmailSchema,
  changePasswordSchema,
  confirmAccountReactivationSchema,
  confirmEmailChangeSchema,
  forgotPasswordSchema,
  loginSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  sessionParamsSchema,
  signupSchema,
  verifyEmailSchema,
} from "@/modules/auth/auth.schema";
import { userViews } from "@/modules/user/user.presenter";
import {
  errorResponses,
  jsonResponse,
  noContentResponse,
  staticList,
} from "../components";
import { fromEnvelope } from "../helpers";

const accessTokenSchema = z
  .object({
    accessToken: z
      .string()
      .meta({ example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }),
  })
  .meta({ id: "AccessToken" });

const messageSchema = z
  .object({ message: z.string() })
  .meta({ id: "MessageResponse" });

export const authPaths: ZodOpenApiPathsObject = {
  "/auth/signup": {
    post: {
      tags: ["Auth"],
      summary: "Cadastro self-service de cliente (nasce PENDING)",
      security: [],
      ...fromEnvelope(signupSchema),
      responses: {
        201: jsonResponse("Usuário criado", userViews.owner),
        202: jsonResponse(
          "O email pertence a uma conta excluída e o cpf confere: nada foi criado e um email de reativação foi enviado",
          messageSchema,
        ),
        409: errorResponses[409],
        422: errorResponses[422],
        429: errorResponses[429],
      },
    },
  },
  "/auth/login": {
    post: {
      tags: ["Auth"],
      summary: "Login — retorna access token e seta o refresh cookie",
      security: [],
      ...fromEnvelope(loginSchema),
      responses: {
        200: jsonResponse("Autenticado", accessTokenSchema),
        401: errorResponses[401],
        403: errorResponses[403],
        422: errorResponses[422],
        429: errorResponses[429],
      },
    },
  },
  "/auth/refresh": {
    post: {
      tags: ["Auth"],
      summary: "Rotaciona o refresh cookie e devolve um novo access token",
      security: [],
      responses: {
        200: jsonResponse("Token renovado", accessTokenSchema),
        401: errorResponses[401],
      },
    },
  },
  "/auth/verify-email": {
    post: {
      tags: ["Auth"],
      summary: "Verifica o email (ativa a conta)",
      security: [],
      ...fromEnvelope(verifyEmailSchema),
      responses: {
        204: noContentResponse,
        400: errorResponses[400],
        422: errorResponses[422],
      },
    },
  },
  "/auth/verify-email/resend": {
    post: {
      tags: ["Auth"],
      summary: "Reenvia o email de verificação (resposta genérica)",
      security: [],
      ...fromEnvelope(resendVerificationSchema),
      responses: {
        200: jsonResponse("Resposta genérica", messageSchema),
        422: errorResponses[422],
        429: errorResponses[429],
      },
    },
  },
  "/auth/forgot-password": {
    post: {
      tags: ["Auth"],
      summary: "Solicita reset de senha (resposta genérica)",
      security: [],
      ...fromEnvelope(forgotPasswordSchema),
      responses: {
        200: jsonResponse("Resposta genérica", messageSchema),
        422: errorResponses[422],
        429: errorResponses[429],
      },
    },
  },
  "/auth/reset-password": {
    post: {
      tags: ["Auth"],
      summary: "Redefine a senha via token (invalida todas as sessões)",
      security: [],
      ...fromEnvelope(resetPasswordSchema),
      responses: {
        204: noContentResponse,
        400: errorResponses[400],
        422: errorResponses[422],
      },
    },
  },
  "/auth/change-password": {
    post: {
      tags: ["Auth"],
      summary: "Troca a senha (logado, exige a senha atual)",
      ...fromEnvelope(changePasswordSchema),
      responses: {
        204: noContentResponse,
        401: errorResponses[401],
        403: errorResponses[403],
        422: errorResponses[422],
      },
    },
  },
  "/auth/change-email": {
    post: {
      tags: ["Auth"],
      summary:
        "Solicita a troca de email (logado, exige a senha atual) — 2 passos, confirma via /auth/confirm-email-change",
      ...fromEnvelope(changeEmailSchema),
      responses: {
        204: noContentResponse,
        401: errorResponses[401],
        403: errorResponses[403],
        409: errorResponses[409],
        422: errorResponses[422],
      },
    },
  },
  "/auth/confirm-email-change": {
    post: {
      tags: ["Auth"],
      summary: "Confirma a troca de email via token",
      security: [],
      ...fromEnvelope(confirmEmailChangeSchema),
      responses: {
        204: noContentResponse,
        400: errorResponses[400],
        409: errorResponses[409],
        422: errorResponses[422],
      },
    },
  },
  "/auth/confirm-account-reactivation": {
    post: {
      tags: ["Auth"],
      summary:
        "Reativa a conta excluída via token e define uma nova senha (o phone só é exigido quando o perfil de cliente precisa nascer do zero)",
      security: [],
      ...fromEnvelope(confirmAccountReactivationSchema),
      responses: {
        204: noContentResponse,
        400: errorResponses[400],
        403: errorResponses[403],
        422: errorResponses[422],
      },
    },
  },
  "/auth/logout": {
    post: {
      tags: ["Auth"],
      summary: "Encerra a sessão atual (revoga o refresh)",
      responses: {
        204: noContentResponse,
        401: errorResponses[401],
      },
    },
  },
  "/auth/sessions": {
    get: {
      tags: ["Auth"],
      summary: "Lista as sessões vivas do usuário",
      responses: {
        200: jsonResponse("Sessões vivas", staticList(sessionViews.default)),
        401: errorResponses[401],
        403: errorResponses[403],
      },
    },
  },
  "/auth/sessions/{id}": {
    delete: {
      tags: ["Auth"],
      summary: "Revoga uma sessão específica",
      ...fromEnvelope(sessionParamsSchema),
      responses: {
        204: noContentResponse,
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
      },
    },
  },
};

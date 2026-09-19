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
  sessionViews,
  signupSchema,
  verifyEmailSchema,
} from "@pet-oasis/api-contracts/auth";
import { errorResponseSchema } from "@pet-oasis/api-contracts/errors";
import { userViews } from "@pet-oasis/api-contracts/user";
import { z } from "zod";
import type { ZodOpenApiPathsObject } from "zod-openapi";
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
      description:
        "Recusa em cinco condições, nesta ordem: credencial errada (401), " +
        "conta travada por tentativas (429, com `Retry-After`), conta banida, " +
        "troca de senha forçada e conta não verificada (as três em 403, cada " +
        "uma com `code` próprio). Email desconhecido e senha errada são " +
        "deliberadamente indistinguíveis; as de 403 só disparam depois de a " +
        "senha conferir, então quem as recebe é o dono da conta.",
      security: [],
      ...fromEnvelope(loginSchema),
      responses: {
        200: jsonResponse("Autenticado", accessTokenSchema),
        401: errorResponses[401],
        // 10.8: a senha conferiu, o *usuário* é que está recusado — e o
        // cliente ramifica a tela pelo `code`, nunca pela prosa de `message`.
        403: jsonResponse(
          "Conta recusada após a senha conferir. `code` distingue a condição: " +
            "`ACCOUNT_BANNED` (banida), `PASSWORD_RESET_REQUIRED` (troca de " +
            "senha forçada — o link chega por email) ou `EMAIL_NOT_VERIFIED` " +
            "(ainda pendente de verificação)",
          errorResponseSchema,
        ),
        422: errorResponses[422],
        429: errorResponses[429],
      },
    },
  },
  "/auth/refresh": {
    post: {
      tags: ["Auth"],
      summary: "Rotaciona o refresh cookie e devolve um novo access token",
      description:
        "Reapresentar o token já usado dentro da janela de graça (10s) devolve " +
        "**o mesmo par** já emitido, em vez de rotacionar de novo; fora da " +
        "janela, é tratado como roubo e invalida todas as sessões. O 503 é " +
        "retentável: dentro da janela, a API não conseguiu reproduzir o par " +
        "emitido e prefere não decidir entre concorrência e roubo. O primeiro " +
        "503 abre uma janela própria de 30s para a retentativa do mesmo token, " +
        "mesmo depois de os 10s terem passado; fora dela, reuso é roubo.",
      security: [],
      responses: {
        200: jsonResponse("Token renovado", accessTokenSchema),
        401: errorResponses[401],
        503: errorResponses[503],
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
        429: errorResponses[429],
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
        429: errorResponses[429],
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
        429: errorResponses[429],
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

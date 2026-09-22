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
} from "../auth/auth.schema";
import {
  accessTokenViews,
  messageViews,
  sessionViews,
} from "../auth/auth.views";
import { staticList } from "../pagination/list-envelope";
import { userViews } from "../user/user.views";
import { errorResponses, noContent } from "./responses";
import type { RouteGroup } from "./route.types";

export const authRoutes = {
  signup: {
    method: "POST",
    path: "/auth/signup",
    tag: "Auth",
    auth: "public",
    summary: "Cadastro self-service de cliente (nasce PENDING)",
    request: signupSchema,
    responses: {
      201: { description: "Usuário criado", view: userViews.owner },
      202: {
        description:
          "O email pertence a uma conta excluída e o cpf confere: nada foi criado e um email de reativação foi enviado",
        view: messageViews.default,
      },
    },
    errors: {
      409: errorResponses[409],
      422: errorResponses[422],
      429: errorResponses[429],
    },
  },
  login: {
    method: "POST",
    path: "/auth/login",
    tag: "Auth",
    auth: "public",
    summary: "Login — retorna access token e seta o refresh cookie",
    description:
      "Recusa em cinco condições, nesta ordem: credencial errada (401), " +
      "conta travada por tentativas (429, com `Retry-After`), conta banida, " +
      "troca de senha forçada e conta não verificada (as três em 403, cada " +
      "uma com `code` próprio). Email desconhecido e senha errada são " +
      "deliberadamente indistinguíveis; as de 403 só disparam depois de a " +
      "senha conferir, então quem as recebe é o dono da conta.",
    request: loginSchema,
    responses: {
      200: { description: "Autenticado", view: accessTokenViews.default },
    },
    errors: {
      401: errorResponses[401],
      // 10.8: a senha conferiu, o *usuário* é que está recusado — e o cliente
      // ramifica a tela pelo `code`, nunca pela prosa de `message`.
      403: {
        ...errorResponses[403],
        description:
          "Conta recusada após a senha conferir. `code` distingue a condição: " +
          "`ACCOUNT_BANNED` (banida), `PASSWORD_RESET_REQUIRED` (troca de " +
          "senha forçada — o link chega por email) ou `EMAIL_NOT_VERIFIED` " +
          "(ainda pendente de verificação)",
      },
      422: errorResponses[422],
      429: errorResponses[429],
    },
  },
  refresh: {
    method: "POST",
    path: "/auth/refresh",
    tag: "Auth",
    auth: "public",
    summary: "Rotaciona o refresh cookie e devolve um novo access token",
    description:
      "Reapresentar o token já usado dentro da janela de graça (10s) devolve " +
      "**o mesmo par** já emitido, em vez de rotacionar de novo; fora da " +
      "janela, é tratado como roubo e invalida todas as sessões. O 503 é " +
      "retentável: dentro da janela, a API não conseguiu reproduzir o par " +
      "emitido e prefere não decidir entre concorrência e roubo. O primeiro " +
      "503 abre uma janela própria de 30s para a retentativa do mesmo token, " +
      "mesmo depois de os 10s terem passado; fora dela, reuso é roubo.",
    responses: {
      200: { description: "Token renovado", view: accessTokenViews.default },
    },
    errors: { 401: errorResponses[401], 503: errorResponses[503] },
  },
  verifyEmail: {
    method: "POST",
    path: "/auth/verify-email",
    tag: "Auth",
    auth: "public",
    summary: "Verifica o email (ativa a conta)",
    request: verifyEmailSchema,
    responses: { 204: noContent },
    errors: { 400: errorResponses[400], 422: errorResponses[422] },
  },
  resendVerification: {
    method: "POST",
    path: "/auth/verify-email/resend",
    tag: "Auth",
    auth: "public",
    summary: "Reenvia o email de verificação (resposta genérica)",
    request: resendVerificationSchema,
    responses: {
      200: { description: "Resposta genérica", view: messageViews.default },
    },
    errors: { 422: errorResponses[422], 429: errorResponses[429] },
  },
  forgotPassword: {
    method: "POST",
    path: "/auth/forgot-password",
    tag: "Auth",
    auth: "public",
    summary: "Solicita reset de senha (resposta genérica)",
    request: forgotPasswordSchema,
    responses: {
      200: { description: "Resposta genérica", view: messageViews.default },
    },
    errors: { 422: errorResponses[422], 429: errorResponses[429] },
  },
  resetPassword: {
    method: "POST",
    path: "/auth/reset-password",
    tag: "Auth",
    auth: "public",
    summary: "Redefine a senha via token (invalida todas as sessões)",
    request: resetPasswordSchema,
    responses: { 204: noContent },
    errors: {
      400: errorResponses[400],
      422: errorResponses[422],
      429: errorResponses[429],
    },
  },
  changePassword: {
    method: "POST",
    path: "/auth/change-password",
    tag: "Auth",
    auth: "bearer",
    summary: "Troca a senha (logado, exige a senha atual)",
    request: changePasswordSchema,
    responses: { 204: noContent },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      422: errorResponses[422],
    },
  },
  changeEmail: {
    method: "POST",
    path: "/auth/change-email",
    tag: "Auth",
    auth: "bearer",
    summary:
      "Solicita a troca de email (logado, exige a senha atual) — 2 passos, confirma via /auth/confirm-email-change",
    request: changeEmailSchema,
    responses: { 204: noContent },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      409: errorResponses[409],
      422: errorResponses[422],
    },
  },
  confirmEmailChange: {
    method: "POST",
    path: "/auth/confirm-email-change",
    tag: "Auth",
    auth: "public",
    summary: "Confirma a troca de email via token",
    request: confirmEmailChangeSchema,
    responses: { 204: noContent },
    errors: {
      400: errorResponses[400],
      409: errorResponses[409],
      422: errorResponses[422],
      429: errorResponses[429],
    },
  },
  confirmAccountReactivation: {
    method: "POST",
    path: "/auth/confirm-account-reactivation",
    tag: "Auth",
    auth: "public",
    summary:
      "Reativa a conta excluída via token e define uma nova senha (o phone só é exigido quando o perfil de cliente precisa nascer do zero)",
    request: confirmAccountReactivationSchema,
    responses: { 204: noContent },
    errors: {
      400: errorResponses[400],
      403: errorResponses[403],
      422: errorResponses[422],
      429: errorResponses[429],
    },
  },
  logout: {
    method: "POST",
    path: "/auth/logout",
    tag: "Auth",
    auth: "bearer",
    summary: "Encerra a sessão atual (revoga o refresh)",
    responses: { 204: noContent },
    errors: { 401: errorResponses[401] },
  },
  listSessions: {
    method: "GET",
    path: "/auth/sessions",
    tag: "Auth",
    auth: "bearer",
    summary: "Lista as sessões vivas do usuário",
    responses: {
      200: {
        description: "Sessões vivas",
        view: staticList(sessionViews.default),
      },
    },
    errors: { 401: errorResponses[401], 403: errorResponses[403] },
  },
  revokeSession: {
    method: "DELETE",
    path: "/auth/sessions/:id",
    tag: "Auth",
    auth: "bearer",
    summary: "Revoga uma sessão específica",
    request: sessionParamsSchema,
    responses: { 204: noContent },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
    },
  },
} satisfies RouteGroup;

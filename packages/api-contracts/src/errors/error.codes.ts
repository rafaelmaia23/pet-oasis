import { z } from "zod";

// O vocabulário de erro: o identificador estável por que o cliente ramifica.
// A prosa de `message` é para o usuário e pode mudar sem quebrar ninguém; o
// `code` é o que tem contrato. O envelope que o carrega está em
// `error.views.ts` — é a folha que quem só precisa do nome importa.

// Os `code` que a API emite hoje, agrupados pelo status HTTP em que aparecem.
// O envelope NÃO restringe `code` a este enum: um `code` novo na API
// (ou um 403 com identificador próprio, como os três de login) não pode fazer
// o parse do cliente falhar. O enum existe para o cliente que trata um caso
// conhecido ter o nome tipado; o que ele não conhece, trata como o status.
export const ERROR_CODES = [
  // 400
  "BAD_REQUEST",
  // 401
  "UNAUTHORIZED",
  // 403 — `FORBIDDEN` é o genérico; os outros três são as recusas de login
  // pós-senha, que o cliente precisa distinguir para levar o usuário ao
  // lugar certo (suporte, redefinição de senha, verificação de email).
  "FORBIDDEN",
  "ACCOUNT_BANNED",
  "PASSWORD_RESET_REQUIRED",
  "EMAIL_NOT_VERIFIED",
  // 404
  "NOT_FOUND",
  // 405
  "METHOD_NOT_ALLOWED",
  // 409
  "CONFLICT",
  // 413
  "PAYLOAD_TOO_LARGE",
  // 422
  "VALIDATION_ERROR",
  // 429 — rate limit por IP e lockout por usuário respondem o mesmo `code`, e
  // ambos carregam `Retry-After`
  "TOO_MANY_REQUESTS",
  // 500
  "INTERNAL_SERVER_ERROR",
  "PRESENTATION_ERROR",
  // 503 — dependência externa indisponível; é retentável, não é "deslogue"
  "SERVICE_UNAVAILABLE",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const errorCodeSchema = z.enum(ERROR_CODES);

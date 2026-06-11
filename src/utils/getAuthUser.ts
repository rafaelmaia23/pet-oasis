import type { Request } from "express";
import { createUnauthorizedError } from "@/errors";
import type { AuthUser } from "@/lib/authorization";

export function getAuthUser(req: Request): AuthUser {
  if (!req.user) {
    throw createUnauthorizedError({
      message: "Usuário não autenticado",
      action: "Faça login e tente novamente",
    });
  }
  return req.user;
}

import jwt from "jsonwebtoken";
import type { StringValue } from "ms";
import { env } from "@/config/env";
import { createNotFoundError, createUnauthorizedError } from "@/errors";
import { verifyPassword } from "@/lib/password";
import { findFeatureByName } from "@/modules/feature/feature.repository";
import { assignManyFeaturesToUser } from "@/modules/permission/permission.repository";
import * as userService from "@/modules/user/user.service";
import * as userRepository from "../user/user.repository";
import * as authRepository from "./auth.repository";
import type { LoginInput, SignupInput } from "./auth.schema";

const CLIENT_DEFAULT_FEATURES = [
  "read:user",
  "update:user",
  "delete:user",
  "logout:session",
];

function generateToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as StringValue,
  });
}

function getExpiresAt(): Date {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // Set expiration to 7 days from now
  return expiresAt;
}

export async function signup(data: SignupInput) {
  const user = await userService.createUser(data);

  const features = await Promise.all(
    CLIENT_DEFAULT_FEATURES.map((featureName) =>
      findFeatureByName(featureName),
    ),
  );

  const featuresIds = features.filter((f) => f !== null).map((f) => f.id);

  await assignManyFeaturesToUser(user.id, featuresIds);

  return user;
}

export async function login(data: LoginInput, existingToken?: string) {
  if (existingToken) {
    const existingSession =
      await authRepository.findSessionByToken(existingToken);

    if (
      existingSession &&
      !existingSession.invalidatedAt &&
      existingSession.expiresAt > new Date()
    ) {
      return { token: existingToken };
    }
  }

  const user = await userRepository.findUserByEmail(data.email);

  if (!user) {
    throw createUnauthorizedError({
      message: "Credenciais inválidas",
      action: "Verifique seu email e senha e tente novamente",
    });
  }

  const passwordMatch = await verifyPassword(data.password, user.passwordHash);

  if (!passwordMatch) {
    throw createUnauthorizedError({
      message: "Credenciais inválidas",
      action: "Verifique seu email e senha e tente novamente",
    });
  }

  const token = generateToken(user.id);

  await authRepository.createSession({
    userId: user.id,
    token,
    expiresAt: getExpiresAt(),
  });

  return { token };
}

export async function logout(token: string) {
  const session = await authRepository.findSessionByToken(token);

  if (!session) {
    throw createNotFoundError({
      message: "Sessão não encontrada",
      action: "Faça login para criar uma nova sessão",
    });
  }

  await authRepository.invalidateSession(session.token);
}

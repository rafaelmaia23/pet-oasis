import {
  createConflictError,
  createForbiddenError,
  createNotFoundError,
} from "@/errors";
import type { AuthUser } from "@/lib/authorization";
import { canActOnResource } from "@/lib/authorization";
import { hashPassword } from "@/lib/password";
import * as userRepository from "@/modules/user/user.repository";
import type {
  CreateUserInput,
  UpdateUserInput,
} from "@/modules/user/user.schema";

export async function createUser(data: CreateUserInput) {
  const existing = await userRepository.findUserByEmail(data.email);

  if (existing) {
    throw createConflictError({
      message: "Email já está em uso",
      action: "Tente outro email",
    });
  }

  const { password, ...userData } = data;

  const passwordHash = await hashPassword(password);

  return userRepository.createUser({ ...userData, passwordHash });
}

export async function getUserById(requestingUser: AuthUser, targetId: string) {
  const user = await userRepository.findUserById(targetId);

  if (!user) {
    throw createNotFoundError({
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  }

  if (!canActOnResource(requestingUser, "read:user", user.id)) {
    throw createForbiddenError({
      message: "Você não tem permissão para acessar este recurso",
      action: 'Verifique se você tem acesso a feature "read:user:others"',
    });
  }

  return user;
}

export async function getUserByEmail(
  requestingUser: AuthUser,
  targetEmail: string,
) {
  const user = await userRepository.findUserByEmail(targetEmail);

  if (!user) {
    throw createNotFoundError({
      message: "Usuário não encontrado",
      action: "Verifique o email e tente novamente",
    });
  }

  if (!canActOnResource(requestingUser, "read:user", user.id)) {
    throw createForbiddenError({
      message: "Você não tem permissão para acessar este recurso",
      action: 'Verifique se você tem acesso a feature "read:user"',
    });
  }

  return user;
}

export async function getAllUsers() {
  return userRepository.findAllUsers();
}

export async function updateUser(
  requestingUser: AuthUser,
  targetId: string,
  data: UpdateUserInput,
) {
  const user = await userRepository.findUserById(targetId);

  if (!user) {
    throw createNotFoundError({
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  }

  if (!canActOnResource(requestingUser, "update:user", user.id)) {
    throw createForbiddenError({
      message: "Você não tem permissão para acessar este recurso",
      action: 'Verifique se você tem acesso a feature "update:user:others"',
    });
  }

  if (data.email && data.email !== user.email) {
    const emailInUse = await userRepository.findUserByEmail(data.email);

    if (emailInUse) {
      throw createConflictError({
        message: "Email já está em uso",
        action: "Tente outro email",
      });
    }
  }

  return userRepository.updateUser(targetId, data);
}

export async function deleteUser(requestingUser: AuthUser, targetId: string) {
  const user = await userRepository.findUserById(targetId);

  if (!user) {
    throw createNotFoundError({
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  }

  if (!canActOnResource(requestingUser, "delete:user", user.id)) {
    throw createForbiddenError({
      message: "Você não tem permissão para acessar este recurso",
      action: 'Verifique se você tem acesso a feature "delete:user:others"',
    });
  }

  return userRepository.deleteUser(targetId);
}

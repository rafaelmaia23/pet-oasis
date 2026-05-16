import { createConflictError, createNotFoundError } from "@/errors";
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

export async function getUserById(id: string) {
  const user = await userRepository.findUserById(id);

  if (!user) {
    throw createNotFoundError({
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  }

  return user;
}

export async function getAllUsers() {
  return userRepository.findAllUsers();
}

export async function updateUser(id: string, data: UpdateUserInput) {
  const user = await userRepository.findUserById(id);

  if (!user) {
    throw createNotFoundError({
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
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

  const { password, ...updateData } = data;

  const passwordHash = password ? await hashPassword(password) : undefined;

  return userRepository.updateUser(id, { ...updateData, passwordHash });
}

export async function deleteUser(id: string) {
  const user = await userRepository.findUserById(id);

  if (!user) {
    throw createNotFoundError({
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  }

  return userRepository.deleteUser(id);
}

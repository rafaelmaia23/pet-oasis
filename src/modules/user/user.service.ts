import { createForbiddenError, createNotFoundError } from "@/errors";
import type { AuthUser } from "@/lib/authorization";
import { canActOnResource } from "@/lib/authorization";
import { hashPassword } from "@/lib/password";
import * as userRepository from "@/modules/user/user.repository";
import type {
  CreateCustomerInput,
  CreateEmployeeInput,
  UpdateUserInput,
} from "@/modules/user/user.schema";
import { validateRoles } from "@/utils/validateRoles";
import { issueEmailVerification } from "../auth/verification.service";
import type { RoleName } from "../role/role.constants";
import { getRolesByNames } from "../role/role.repository";

export const DEFAULT_EMPLOYEE_ROLES: RoleName[] = ["attendant"];
export const DEFAULT_CUSTOMER_ROLES: RoleName[] = ["customer"];

export async function createEmployee(data: CreateEmployeeInput) {
  const rolesList = data.roleNames
    ? await getRolesByNames(data.roleNames)
    : await getRolesByNames(DEFAULT_EMPLOYEE_ROLES);

  validateRoles(rolesList, "EMPLOYEE");

  const { password, ...userData } = data;

  const passwordHash = await hashPassword(password);

  const user = await userRepository.createEmployee({
    ...userData,
    passwordHash,
    roleNames: rolesList.map((r) => r.name as RoleName),
  });

  await issueEmailVerification(user.id, user.email);

  return user;
}

export async function createCustomer(data: CreateCustomerInput) {
  const rolesList = await getRolesByNames(DEFAULT_CUSTOMER_ROLES);

  validateRoles(rolesList, "CUSTOMER");

  const { password, ...userData } = data;

  const passwordHash = await hashPassword(password);

  const user = await userRepository.createCustomer({
    ...userData,
    passwordHash,
    roleNames: rolesList.map((r) => r.name as RoleName),
  });

  await issueEmailVerification(user.id, user.email);

  return user;
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
  if (!canActOnResource(requestingUser, "update:user", targetId)) {
    throw createForbiddenError({
      message: "Você não tem permissão para acessar este recurso",
      action: 'Verifique se você tem acesso a feature "update:user:others"',
    });
  }

  const user = await userRepository.findUserById(targetId);

  if (!user) {
    throw createNotFoundError({
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  }

  return userRepository.updateUser(targetId, data);
}

export async function deleteUser(requestingUser: AuthUser, targetId: string) {
  if (!canActOnResource(requestingUser, "delete:user", targetId)) {
    throw createForbiddenError({
      message: "Você não tem permissão para acessar este recurso",
      action: 'Verifique se você tem acesso a feature "delete:user:others"',
    });
  }

  const user = await userRepository.findUserById(targetId);

  if (!user) {
    throw createNotFoundError({
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  }

  return await userRepository.softDeleteUserAndInvalidateSessions(targetId);
}

import {
  createConflictError,
  createForbiddenError,
  createNotFoundError,
} from "@/errors";
import type { AuthUser } from "@/lib/authorization";
import {
  assertActorIsAdmin,
  canActOnResource,
  computeEffectiveFeatures,
} from "@/lib/authorization";
import { logger } from "@/lib/logger";
import { hashPassword } from "@/lib/password";
import * as userRepository from "@/modules/user/user.repository";
import type {
  CreateCustomerInput,
  CreateEmployeeInput,
  UpdateUserInput,
} from "@/modules/user/user.schema";
import { validateRoles } from "@/utils/validateRoles";
import { issueEmailVerification } from "../auth/verification.service";
import { PERMISSION_FEATURES, type RoleName } from "../role/role.constants";
import { getRolesByNames } from "../role/role.repository";

const log = logger.child({ module: "user" });

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

  log.info(
    {
      userId: user.id,
      profile: "EMPLOYEE",
      roles: rolesList.map((r) => r.name),
    },
    "user created",
  );

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

  log.info({ userId: user.id, profile: "CUSTOMER" }, "user created");

  await issueEmailVerification(user.id, user.email);

  return user;
}

export async function getUserById(requestingUser: AuthUser, targetId: string) {
  if (!canActOnResource(requestingUser, "read:user", targetId)) {
    throw createForbiddenError({
      message: "Você não tem permissão para acessar este recurso",
      action: 'Verifique se você tem acesso a feature "read:user:others"',
    });
  }

  const user = await userRepository.findUserById(targetId);

  if (!user) {
    throw createNotFoundError({
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
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

  const deleted =
    await userRepository.softDeleteUserAndInvalidateSessions(targetId);

  log.info(
    { userId: targetId, actorId: requestingUser.id },
    "user soft deleted, all sessions invalidated",
  );

  return deleted;
}

type UserForFeatureComputation = NonNullable<
  Awaited<ReturnType<typeof userRepository.getUserForFeatureComputation>>
>;

async function assertAdminForBan(
  requestingUserId: string,
  target: UserForFeatureComputation,
) {
  const effectiveFeatures = computeEffectiveFeatures(target);

  const isPrivileged =
    effectiveFeatures.has("*") ||
    PERMISSION_FEATURES.some((feature) => effectiveFeatures.has(feature));

  if (!isPrivileged) return;

  const requestingUser = await userRepository.findUserById(requestingUserId);

  assertActorIsAdmin(requestingUser, {
    message: "Apenas administradores podem banir usuários privilegiados",
    action: "Solicite a um administrador que faça essa alteração",
  });
}

export async function banUser(
  requestingUserId: string,
  targetId: string,
  reason: string,
) {
  if (requestingUserId === targetId) {
    throw createConflictError({
      message: "Não é possível banir a si mesmo",
      action: "Peça a outro administrador que faça essa alteração",
    });
  }

  const target = await userRepository.getUserForFeatureComputation(targetId);

  if (!target) {
    throw createNotFoundError({
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  }

  await assertAdminForBan(requestingUserId, target);

  if (target.bannedAt !== null) {
    throw createConflictError({
      message: "Usuário já está banido",
      action: "Verifique o estado do usuário",
    });
  }

  const banned = await userRepository.banUserAndInvalidateSessions(
    targetId,
    requestingUserId,
    reason,
  );

  // O texto do motivo não entra na linha: fica no banco, para quem tem
  // permissão de ler o usuário.
  log.info(
    { userId: targetId, actorId: requestingUserId },
    "user banned, all sessions invalidated",
  );

  return banned;
}

export async function unbanUser(requestingUserId: string, targetId: string) {
  if (requestingUserId === targetId) {
    throw createConflictError({
      message: "Não é possível desbanir a si mesmo",
      action: "Peça a outro administrador que faça essa alteração",
    });
  }

  const target = await userRepository.getUserForFeatureComputation(targetId);

  if (!target) {
    throw createNotFoundError({
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  }

  await assertAdminForBan(requestingUserId, target);

  if (target.bannedAt === null) {
    throw createConflictError({
      message: "Usuário não está banido",
      action: "Verifique o estado do usuário",
    });
  }

  const unbanned = await userRepository.unbanUser(targetId);

  log.info({ userId: targetId, actorId: requestingUserId }, "user unbanned");

  return unbanned;
}

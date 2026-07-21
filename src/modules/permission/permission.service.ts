import {
  createConflictError,
  createNotFoundError,
  createValidationError,
} from "@/errors";
import {
  assertActorIsAdmin,
  computeEffectiveFeatures,
} from "@/lib/authorization";
import * as featureRepository from "@/modules/feature/feature.repository";
import { PERMISSION_FEATURES } from "../role/role.constants";
import * as roleRepository from "../role/role.repository";
import { toRoleDTO } from "../role/role.service";
import * as userRepository from "../user/user.repository";
import * as permissionRepository from "./permission.repository";

const PERMISSION_FEATURE_SET: Set<string> = new Set(PERMISSION_FEATURES);

type RoleWithFeatures = NonNullable<
  Awaited<ReturnType<typeof roleRepository.getRoleById>>
>;

type UserWithRelations = NonNullable<
  Awaited<ReturnType<typeof userRepository.findUserById>>
>;

async function assertAdminForPermissionFeature(
  requestingUserId: string,
  featureName: string,
) {
  if (!PERMISSION_FEATURE_SET.has(featureName)) return;

  const requestingUser = await userRepository.findUserById(requestingUserId);

  assertActorIsAdmin(requestingUser, {
    message: "Apenas administradores podem alterar features de permissão",
    action: "Solicite a um administrador que faça essa alteração",
  });
}

async function assertAdminForRoleAssignment(
  requestingUserId: string,
  role: RoleWithFeatures,
) {
  const isPrivilegedRole = role.features.some(
    (rf) =>
      rf.feature.name === "*" || PERMISSION_FEATURE_SET.has(rf.feature.name),
  );

  if (!isPrivilegedRole) return;

  const requestingUser = await userRepository.findUserById(requestingUserId);

  assertActorIsAdmin(requestingUser, {
    message: "Apenas administradores podem atribuir roles privilegiadas",
    action: "Solicite a um administrador que faça essa alteração",
  });
}

function assertRoleAppliesToActiveProfile(
  role: RoleWithFeatures,
  user: UserWithRelations,
) {
  if (!role.appliesTo) return;

  const hasActiveCustomer =
    user.customer !== null && user.customer.deletedAt === null;

  const hasActiveEmployee =
    user.employee !== null && user.employee.deletedAt === null;

  const isCompatible =
    (role.appliesTo === "CUSTOMER" && hasActiveCustomer) ||
    (role.appliesTo === "EMPLOYEE" && hasActiveEmployee);

  if (!isCompatible) {
    const profileLabel =
      role.appliesTo === "CUSTOMER" ? "de cliente" : "de funcionário";
    const createEndpoint =
      role.appliesTo === "CUSTOMER" ? "customer" : "employee";

    throw createValidationError({
      message: `Usuário não possui um perfil ${profileLabel} ativo, incompatível com a role "${role.name}"`,
      errors: {
        roleId: [`Role "${role.name}" exige um perfil ${profileLabel} ativo`],
      },
      action: `Crie o perfil ${profileLabel} do usuário (POST /users/:id/${createEndpoint}) antes de atribuir esta role`,
    });
  }
}

export async function getUserFeatures(userId: string) {
  const user = await userRepository.findUserById(userId);

  if (!user) {
    throw createNotFoundError({
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  }

  return permissionRepository.getUserFeatures(userId);
}

export async function getUserRoles(userId: string) {
  const user = await userRepository.findUserById(userId);

  if (!user) {
    throw createNotFoundError({
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  }

  const roles = await permissionRepository.getUserRoles(userId);

  return roles.map(toRoleDTO);
}

export async function getUserPermissions(userId: string) {
  const user = await userRepository.getUserForFeatureComputation(userId);

  if (!user) {
    throw createNotFoundError({
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  }

  return Array.from(computeEffectiveFeatures(user)).sort();
}

export async function addUserRole(
  requestingUserId: string,
  targetUserId: string,
  roleId: string,
) {
  const role = await roleRepository.getRoleById(roleId);

  if (!role) {
    throw createNotFoundError({
      message: "Role não encontrada",
      action: "Verifique o ID e tente novamente",
    });
  }

  await assertAdminForRoleAssignment(requestingUserId, role);

  const user = await userRepository.findUserById(targetUserId);

  if (!user) {
    throw createNotFoundError({
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  }

  assertRoleAppliesToActiveProfile(role, user);

  const alreadyHasRole = user.roles.some((ur) => ur.role.id === roleId);

  if (alreadyHasRole) {
    throw createConflictError({
      message: "Usuário já possui essa role",
      action: "Verifique as roles do usuário",
    });
  }

  const userRole = await permissionRepository.addUserRole(targetUserId, roleId);

  return toRoleDTO(userRole.role);
}

export async function removeUserRole(
  requestingUserId: string,
  targetUserId: string,
  roleId: string,
) {
  const role = await roleRepository.getRoleById(roleId);

  if (!role) {
    throw createNotFoundError({
      message: "Role não encontrada",
      action: "Verifique o ID e tente novamente",
    });
  }

  await assertAdminForRoleAssignment(requestingUserId, role);

  const user = await userRepository.findUserById(targetUserId);

  if (!user) {
    throw createNotFoundError({
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  }

  const userRole = user.roles.find((ur) => ur.role.id === roleId);

  if (!userRole) {
    throw createNotFoundError({
      message: "Usuário não possui essa role ativa",
      action: "Verifique as roles do usuário",
    });
  }

  if (role.appliesTo) {
    const remainingActiveRoles = user.roles.filter(
      (ur) => ur.role.id !== roleId && ur.role.appliesTo === role.appliesTo,
    );

    if (remainingActiveRoles.length === 0) {
      const profileLabel =
        role.appliesTo === "CUSTOMER" ? "de cliente" : "de funcionário";
      const deleteEndpoint =
        role.appliesTo === "CUSTOMER" ? "customer" : "employee";

      throw createConflictError({
        message: `Não é possível remover a última role ${profileLabel} do usuário`,
        action: `Para remover o perfil ${profileLabel} inteiro, use o endpoint DELETE /users/:id/${deleteEndpoint}`,
      });
    }
  }

  return permissionRepository.removeUserRole(userRole.id);
}

export async function upsertUserFeature(
  requestingUserId: string,
  targetUserId: string,
  featureId: string,
  granted: boolean,
) {
  const feature = await featureRepository.getFeatureById(featureId);

  if (!feature) {
    throw createNotFoundError({
      message: "Feature não encontrada",
      action: "Verifique o ID e tente novamente",
    });
  }

  await assertAdminForPermissionFeature(requestingUserId, feature.name);

  const user = await userRepository.findUserById(targetUserId);

  if (!user) {
    throw createNotFoundError({
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  }

  return await permissionRepository.upsertUserFeature(
    targetUserId,
    featureId,
    granted,
  );
}

export async function removeUserFeature(
  requesterId: string,
  targetId: string,
  featureId: string,
) {
  const feature = await featureRepository.getFeatureById(featureId);

  if (!feature) {
    throw createNotFoundError({
      message: "Feature não encontrada",
      action: "Verifique o ID e tente novamente",
    });
  }

  await assertAdminForPermissionFeature(requesterId, feature.name);

  const user = await userRepository.findUserById(targetId);

  if (!user) {
    throw createNotFoundError({
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  }

  const userFeature = user.features.find((uf) => uf.featureId === featureId);

  if (!userFeature) {
    throw createNotFoundError({
      message: "Usuário não possui essa feature override",
      action: "Verifique as features do usuário",
    });
  }

  return permissionRepository.removeUserFeature(userFeature.id);
}

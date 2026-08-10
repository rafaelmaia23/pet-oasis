import {
  createConflictError,
  createNotFoundError,
  createValidationError,
} from "@/errors";
import {
  assertActorIsAdmin,
  computeEffectiveFeatures,
  isAdmin,
} from "@/lib/authorization";
import { logger } from "@/lib/logger";
import * as featureRepository from "@/modules/feature/feature.repository";
import { PRIVILEGED_FEATURES } from "../role/role.constants";
import * as roleRepository from "../role/role.repository";
import { toRoleDTO } from "../role/role.service";
import * as userRepository from "../user/user.repository";
import * as permissionRepository from "./permission.repository";

const log = logger.child({ module: "permission" });

// Features cuja concessão/atribuição exige role admin (não-escalação): as de
// permissão + `read:audit-log:full`. Ver `PRIVILEGED_FEATURES`.
const PRIVILEGED_FEATURE_SET: Set<string> = new Set(PRIVILEGED_FEATURES);

/** O wildcard entra junto: quem tem `*` tem tudo, inclusive as privilegiadas. */
const isPrivilegedFeature = (name: string) =>
  name === "*" || PRIVILEGED_FEATURE_SET.has(name);

type RoleWithFeatures = NonNullable<
  Awaited<ReturnType<typeof roleRepository.getRoleById>>
>;

type UserWithRelations = NonNullable<
  Awaited<ReturnType<typeof userRepository.findUserById>>
>;

type OverrideWithRelations = Awaited<
  ReturnType<typeof permissionRepository.getUserFeatures>
>[number];

/** Achata a junção `userRole.role` na forma que a view espera (K2). */
function toUserFeatureDTO(override: OverrideWithRelations) {
  return {
    granted: override.granted,
    grantedAt: override.grantedAt,
    updatedAt: override.updatedAt,
    role: {
      id: override.userRole.role.id,
      name: override.userRole.role.name,
    },
    feature: override.feature,
  };
}

async function assertAdminForPermissionFeature(
  requestingUserId: string,
  featureName: string,
) {
  if (!isPrivilegedFeature(featureName)) return;

  const requestingUser = await userRepository.findUserById(requestingUserId);

  assertActorIsAdmin(requestingUser, {
    message: "Apenas administradores podem alterar features privilegiadas",
    action: "Solicite a um administrador que faça essa alteração",
  });
}

async function assertAdminForRoleAssignment(
  requestingUserId: string,
  role: RoleWithFeatures,
) {
  const isPrivilegedRole = role.features.some((rf) =>
    isPrivilegedFeature(rf.feature.name),
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

  const overrides = await permissionRepository.getUserFeatures(userId);

  return overrides.map(toUserFeatureDTO);
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

  // D16: autorizar a **ação** (guard acima) é uma coisa; autorizar o
  // **conteúdo** que volta junto é outra. A role é concedida de qualquer jeito,
  // mas um override privilegiado pendurado nela só ressuscita para um admin —
  // senão re-conceder uma role banal viraria caminho de escalação, invisível
  // para `assertAdminForRoleAssignment`, que só lê as features estáticas.
  const requestingUser = await userRepository.findUserById(requestingUserId);
  const actorIsAdmin = isAdmin(requestingUser);

  const userRole = await permissionRepository.addUserRole(
    targetUserId,
    roleId,
    {
      canRestore: (featureName) =>
        actorIsAdmin || !isPrivilegedFeature(featureName),
      describeSkip: (featureName) => ({
        action: "USER_PERMISSION_RESTORE_SKIPPED",
        targetType: "User",
        targetId: targetUserId,
        metadata: { featureName, roleId, roleName: role.name },
      }),
    },
    {
      action: "USER_ROLE_GRANTED",
      targetType: "User",
      targetId: targetUserId,
      metadata: { roleId, roleName: role.name },
    },
  );

  log.info(
    {
      userId: targetUserId,
      actorId: requestingUserId,
      roleId,
      roleName: role.name,
    },
    "role granted",
  );

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

  const removed = await permissionRepository.removeUserRole(
    userRole.id,
    ({ cascadedOverrides }) => ({
      action: "USER_ROLE_REVOKED",
      targetType: "User",
      targetId: targetUserId,
      // Os overrides da role morrem junto (D2); a contagem deixa o efeito
      // visível na trilha sem gerar uma linha por override (K6).
      metadata: { roleId, roleName: role.name, cascadedOverrides },
    }),
  );

  log.info(
    {
      userId: targetUserId,
      actorId: requestingUserId,
      roleId,
      roleName: role.name,
    },
    "role revoked",
  );

  return removed;
}

export async function upsertUserFeature(
  requestingUserId: string,
  targetUserId: string,
  roleId: string,
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

  const role = await roleRepository.getRoleById(roleId);

  if (!role) {
    throw createNotFoundError({
      message: "Role não encontrada",
      action: "Verifique o ID e tente novamente",
    });
  }

  // K1: o override pertence à atribuição de role (D2), então sem atribuição
  // ativa não há onde pendurá-lo. Semântica (precisa do banco) → 422.
  const userRole = await permissionRepository.findActiveUserRole(
    targetUserId,
    roleId,
  );

  if (!userRole) {
    throw createValidationError({
      message: `Usuário não possui a role "${role.name}" ativa`,
      errors: {
        roleId: [
          `Override de feature exige que o usuário tenha a role "${role.name}" ativa`,
        ],
      },
      action: `Conceda a role ao usuário (POST /users/:id/roles/${roleId}) antes de criar o override`,
    });
  }

  const userFeature = await permissionRepository.upsertUserFeature(
    userRole.id,
    featureId,
    granted,
    {
      action: "USER_PERMISSION_GRANTED",
      targetType: "User",
      targetId: targetUserId,
      metadata: {
        featureName: feature.name,
        roleId,
        roleName: role.name,
        effect: granted ? "GRANT" : "DENY",
      },
    },
  );

  log.info(
    {
      userId: targetUserId,
      actorId: requestingUserId,
      featureName: feature.name,
      roleId,
      roleName: role.name,
      effect: granted ? "GRANT" : "DENY",
    },
    "feature override set",
  );

  return toUserFeatureDTO(userFeature);
}

export async function removeUserFeature(
  requesterId: string,
  targetId: string,
  roleId: string,
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

  // K5: um só 404 para a tripla inteira — não checa a role antes, de propósito.
  // Assimétrico com o PUT: aqui a resposta não revela se o usuário tem a role.
  const userFeature = await permissionRepository.findActiveUserFeature(
    targetId,
    roleId,
    featureId,
  );

  if (!userFeature) {
    throw createNotFoundError({
      message: "Usuário não possui essa feature override",
      action: "Verifique as features do usuário",
    });
  }

  const removed = await permissionRepository.removeUserFeature(userFeature.id, {
    action: "USER_PERMISSION_REVOKED",
    targetType: "User",
    targetId,
    metadata: { featureName: feature.name, roleId },
  });

  log.info(
    {
      userId: targetId,
      actorId: requesterId,
      featureName: feature.name,
      roleId,
    },
    "feature override removed",
  );

  return removed;
}

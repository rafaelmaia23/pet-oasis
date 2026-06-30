import { createForbiddenError, createNotFoundError } from "@/errors";
import * as featureRepository from "@/modules/feature/feature.repository";
import { PERMISSION_FEATURES } from "../role/role.constants";
import * as userRepository from "../user/user.repository";
import * as permissionRepository from "./permission.repository";

const PERMISSION_FEATURE_SET: Set<string> = new Set(PERMISSION_FEATURES);

async function assertAdminForPermissionFeature(
  requestingUserId: string,
  featureName: string,
) {
  if (!PERMISSION_FEATURE_SET.has(featureName)) return;

  const requestingUser = await userRepository.findUserById(requestingUserId);

  const isAdmin =
    requestingUser?.roles.some((r) => r.role.name === "admin") ?? false;

  if (!isAdmin) {
    throw createForbiddenError({
      message: "Apenas administradores podem alterar features de permissão",
      action: "Solicite a um administrador que faça essa alteração",
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

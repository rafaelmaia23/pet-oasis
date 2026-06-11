import {
  createConflictError,
  createForbiddenError,
  createNotFoundError,
} from "@/errors";
import * as featureRepository from "@/modules/feature/feature.repository";
import * as userRepository from "../user/user.repository";
import * as permissionRepository from "./permission.repository";

export async function getUserFeatures(userId: string) {
  const user = await userRepository.findUserById(userId);

  if (!user) {
    throw createNotFoundError({
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  }

  return permissionRepository.findUserFeatures(userId);
}

export async function assignFeatureToUser(userId: string, featureId: string) {
  const user = await userRepository.findUserById(userId);

  if (!user) {
    throw createNotFoundError({
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  }

  const feature = await featureRepository.findFeatureById(featureId);

  if (!feature) {
    throw createNotFoundError({
      message: "Feature não encontrada",
      action: "Verifique o ID e tente novamente",
    });
  }

  const alreadyAssigned = user.features.some(
    (uf) => uf.featureId === featureId,
  );

  if (alreadyAssigned) {
    throw createConflictError({
      message: "Usuário já possui essa feature",
      action: "Verifique as features do usuário",
    });
  }

  return permissionRepository.assignFeatureToUser(userId, featureId);
}

export async function removeFeatureFromUser(
  requesterId: string,
  targetId: string,
  featureId: string,
) {
  const user = await userRepository.findUserById(targetId);

  if (!user) {
    throw createNotFoundError({
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  }

  const assignedFeature = user.features.find(
    (uf) => uf.featureId === featureId,
  );

  if (!assignedFeature) {
    throw createNotFoundError({
      message: "Usuário não possui essa feature",
      action: "Verifique as features do usuário",
    });
  }

  if (
    requesterId === targetId &&
    assignedFeature.feature.name === "manage:feature"
  ) {
    throw createForbiddenError({
      message: "Você não pode remover sua própria permissão de gestão",
      action: "Solicite a outro administrador que faça essa alteração",
    });
  }

  return permissionRepository.removeFeatureFromUser(targetId, featureId);
}

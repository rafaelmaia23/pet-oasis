import { createNotFoundError } from "@/errors/errorFactory";
import * as roleRepository from "./role.repository";

export async function getAllRoles() {
  const rolesFromDb = await roleRepository.getAllRoles();

  const roles = rolesFromDb.map((role) => ({
    id: role.id,
    name: role.name,
    description: role.description,
    appliesTo: role.appliesTo,
    features: role.features.map((rf) => ({
      id: rf.feature.id,
      name: rf.feature.name,
      description: rf.feature.description,
    })),
  }));

  return roles;
}

export async function getRoleById(id: string) {
  const roleFromDb = await roleRepository.getRoleById(id);

  if (!roleFromDb)
    throw createNotFoundError({
      message: "Role não encontrado",
      action: "Verifique o ID e tente novamente",
    });

  const role = {
    id: roleFromDb.id,
    name: roleFromDb.name,
    description: roleFromDb.description,
    appliesTo: roleFromDb.appliesTo,
    features: roleFromDb.features.map((rf) => ({
      id: rf.feature.id,
      name: rf.feature.name,
      description: rf.feature.description,
    })),
  };

  return role;
}

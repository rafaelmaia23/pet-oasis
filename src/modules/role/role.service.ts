import { createNotFoundError } from "@/errors/errorFactory";
import * as roleRepository from "./role.repository";

type RoleWithFeatures = NonNullable<
  Awaited<ReturnType<typeof roleRepository.getRoleById>>
>;

export function toRoleDTO(role: RoleWithFeatures) {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    appliesTo: role.appliesTo,
    features: role.features.map((rf) => ({
      id: rf.feature.id,
      name: rf.feature.name,
      description: rf.feature.description,
    })),
  };
}

export async function getAllRoles() {
  const rolesFromDb = await roleRepository.getAllRoles();

  return rolesFromDb.map(toRoleDTO);
}

export async function getRoleById(id: string) {
  const roleFromDb = await roleRepository.getRoleById(id);

  if (!roleFromDb)
    throw createNotFoundError({
      message: "Role não encontrado",
      action: "Verifique o ID e tente novamente",
    });

  return toRoleDTO(roleFromDb);
}

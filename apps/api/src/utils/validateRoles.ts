import { createValidationError } from "@/errors/errorFactory";
import type { ProfileKind, Role } from "@/generated/prisma/client";

export function validateRoles(
  rolesList: Role[],
  expectedAppliesTo: ProfileKind,
) {
  const incompatibleRoles = rolesList.filter(
    (r) => r.appliesTo !== expectedAppliesTo,
  );

  if (incompatibleRoles.length > 0) {
    throw createValidationError({
      message: "Roles incompatíveis",
      errors: {
        roleNames: incompatibleRoles.map(
          (r) => `Role ${r.name} é incompatível`,
        ),
      },
      action: `Verifique os roles informados e tente novamente`,
    });
  }
}

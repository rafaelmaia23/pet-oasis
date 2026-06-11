import { createInternalServerError } from "@/errors/index";

export type AuthUser = {
  id: string;
  features: { name: string }[];
};

export function hasFeature(user: AuthUser, feature: string): boolean {
  validateUser(user);

  return user.features.some((f) => f.name === feature);
}

export function can(user: AuthUser, requiredFeature: string): boolean {
  validateUser(user);

  return (
    hasFeature(user, requiredFeature) ||
    hasFeature(user, `${requiredFeature}:others`)
  );
}

export function canActOnResource(
  user: AuthUser,
  requiredFeature: string,
  resourceOwnerId: string,
): boolean {
  validateUser(user);

  if (hasFeature(user, `${requiredFeature}:others`)) {
    return true;
  }

  if (hasFeature(user, requiredFeature) && user.id === resourceOwnerId) {
    return true;
  }

  return false;
}

function validateUser(user: AuthUser): void {
  if (!user || typeof user.id !== "string" || !Array.isArray(user.features)) {
    throw createInternalServerError({
      message: "Invalid user data",
      cause: "User data in Authorization functions must be valid",
    });
  }
}

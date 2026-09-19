import type { UserView } from "@pet-oasis/api-contracts/user";
import type { AuthUser } from "@/lib/authorization";
import { hasFeature } from "@/lib/authorization";

export function resolveUserView(viewer: AuthUser): UserView {
  if (hasFeature(viewer, "read:user:others")) return "admin";
  return "owner";
}

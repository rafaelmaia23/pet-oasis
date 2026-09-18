import type { AuthUser } from "@/lib/authorization";
import { hasFeature } from "@/lib/authorization";
import type { UserView } from "./user.presenter";

export function resolveUserView(viewer: AuthUser): UserView {
  if (hasFeature(viewer, "read:user:others")) return "admin";
  return "owner";
}

import type { AuditDescriptor } from "@/lib/auditLog";
import type { CascadeCounts } from "@/modules/user/user.lifecycle.repository";

// Sem FK (idioma de AuditLog.actorId) — ator de fixture, sem request real por
// trás (docs/adr/0205).
export const FIXTURE_ACTOR_ID = "00000000-0000-0000-0000-0000000000f1";

/**
 * Descritor mínimo para uma escrita de fixture: a mesma ação de negócio que o
 * service geraria, sem passar pelo ator/request que ele exige — mesmo corte
 * que as factories já fazem ao escrever pelo repository (docs/adr/0205).
 */
export function fixtureAudit(
  audit: Omit<AuditDescriptor, "actorId">,
): AuditDescriptor {
  return { actorId: FIXTURE_ACTOR_ID, ...audit };
}

/**
 * O `describeAudit` que `softDeleteUserAndInvalidateSessions` exige, para
 * quando o teste só precisa do usuário deletado — não do conteúdo da linha.
 */
export const describeUserDeletedAudit =
  (userId: string) =>
  (counts: CascadeCounts): AuditDescriptor =>
    fixtureAudit({
      action: "USER_DELETED",
      targetType: "User",
      targetId: userId,
      metadata: {
        cascadedProfiles: counts.profiles,
        cascadedRoles: counts.roles,
        cascadedOverrides: counts.overrides,
        cascadedPets: counts.pets,
      },
    });

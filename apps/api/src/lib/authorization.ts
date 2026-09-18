import { createForbiddenError } from "@/errors";

export type AuthUser = {
  id: string;
  features: Set<string>;
};

/** Ator já buscado no banco; `null` = não encontrado (ex.: deletado). */
type ActorWithRoles = { roles: { role: { name: string } }[] } | null;

export function isAdmin(actor: ActorWithRoles): boolean {
  return actor?.roles.some((r) => r.role.name === "admin") ?? false;
}

/**
 * Guarda de não-escalação compartilhada: exige que o **ator** seja admin.
 *
 * Cada caso de uso continua dono do seu próprio predicado de "o alvo é
 * privilegiado" e da sua mensagem — o que se repetia entre `assertAdminForBan`,
 * `assertAdminForPermissionFeature` e `assertAdminForRoleAssignment` era só
 * este miolo. Recebe o ator já buscado em vez de buscá-lo: `lib/` não conhece
 * repository (isso inverteria o corte de camadas do projeto).
 */
export function assertActorIsAdmin(
  actor: ActorWithRoles,
  { message, action }: { message: string; action: string },
): void {
  if (isAdmin(actor)) return;

  throw createForbiddenError({ message, action });
}

type FeatureRef = { feature: { name: string } };

/**
 * Overrides moram dentro da atribuição de role (D2, Fase 8.0) — não há mais
 * `user.features`. Quem monta este shape é `getUserForFeatureComputation`, que
 * filtra `deletedAt: null` nos três níveis.
 */
type UserForFeatureComputation = {
  roles: {
    role: { features: FeatureRef[] };
    features: { granted: boolean; feature: { name: string } }[];
  }[];
};

export function hasFeature(user: AuthUser, feature: string): boolean {
  return user.features.has("*") || user.features.has(feature);
}

export function can(user: AuthUser, requiredFeature: string): boolean {
  return (
    hasFeature(user, `${requiredFeature}:others`) ||
    hasFeature(user, requiredFeature)
  );
}

export function canActOnResource(
  user: AuthUser,
  requiredFeature: string,
  resourceOwnerId: string,
): boolean {
  if (hasFeature(user, `${requiredFeature}:others`)) {
    return true;
  }

  if (hasFeature(user, requiredFeature) && user.id === resourceOwnerId) {
    return true;
  }

  return false;
}

export function computeEffectiveFeatures(
  user: UserForFeatureComputation,
): Set<string> {
  const effectiveFeatures = new Set<string>();

  // Dois laços, não um aninhado: TODAS as features estáticas antes de QUALQUER
  // override. Num laço só, um deny pendurado na role A seria aplicado antes de
  // a role B somar a feature — e o resultado dependeria da ordem das roles.
  for (const userRole of user.roles) {
    for (const feature of userRole.role.features) {
      effectiveFeatures.add(feature.feature.name);
    }
  }

  for (const userRole of user.roles) {
    for (const override of userRole.features) {
      override.granted
        ? effectiveFeatures.add(override.feature.name)
        : effectiveFeatures.delete(override.feature.name);
    }
  }

  return effectiveFeatures;
}

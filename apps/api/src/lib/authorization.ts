import { createForbiddenError, createNotFoundError } from "@/errors";

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

/** A convenção do sufixo tem um dono: agir sobre o recurso de **outro**. */
const othersOf = (feature: string) => `${feature}:others`;

export function canActOnResource(
  user: AuthUser,
  requiredFeature: string,
  resourceOwnerId: string,
): boolean {
  if (hasFeature(user, othersOf(requiredFeature))) {
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

/**
 * A mensagem do 403 de feature. Uma só, para todos os emissores: o que de fato
 * distingue um caso do outro é o `action`, e ele é derivado logo abaixo.
 */
const FORBIDDEN_MESSAGE = "Você não tem permissão para acessar este recurso";

/**
 * O `action` do 403, derivado das features exigidas em vez de digitado em prosa
 * em cada call site. Dono único: antes desta função a frase existia em cópia no
 * porteiro da rota e no serviço de perfil, e as duas podiam divergir sem que
 * nada reclamasse.
 */
const describeFeatures = (features: string[]) =>
  features.length === 1
    ? `Verifique se você tem acesso a feature "${features[0]}"`
    : `Verifique se você tem acesso a uma das features: ${features
        .map((feature) => `"${feature}"`)
        .join(", ")}`;

/** O 403 de quem não tem nenhuma das features exigidas. */
export function createFeatureForbiddenError(features: string[]) {
  return createForbiddenError({
    message: FORBIDDEN_MESSAGE,
    action: describeFeatures(features),
  });
}

/**
 * Exige **alguma** das features sobre um recurso cujo dono já se conhece.
 *
 * O `action` nomeia a variante que faltou de verdade: pedir `:others` a quem
 * está agindo sobre o próprio recurso mandaria o usuário atrás da feature
 * errada.
 */
export function assertCanActOnResource(
  actor: AuthUser,
  features: string[],
  resourceOwnerId: string,
): void {
  if (
    features.some((feature) =>
      canActOnResource(actor, feature, resourceOwnerId),
    )
  ) {
    return;
  }

  const scope = (feature: string) =>
    actor.id === resourceOwnerId ? feature : othersOf(feature);

  throw createFeatureForbiddenError(features.map(scope));
}

/**
 * Exige **alguma** das features, sem dono: é a forma de uma feature que não tem
 * par self/`:others` porque nunca há self-service (D11 — virar funcionário).
 */
export function assertHasAnyFeature(actor: AuthUser, features: string[]): void {
  if (features.some((feature) => hasFeature(actor, feature))) return;

  throw createFeatureForbiddenError(features);
}

type NotFoundContent = { message: string; action: string };

type AuthorizeThenLoadBase<T> = {
  actor: AuthUser;
  /** Uma feature, ou as que valem em OR — o 403 nomeia todas as que faltaram. */
  feature: string | string[];
  load: () => Promise<T | null>;
  notFound: NotFoundContent;
};

/**
 * Os três modos. O que muda entre eles é **de onde vem o dono** do recurso; a
 * ordem dos dois passos é consequência disso, não escolha do call site.
 */
type AuthorizeThenLoadOptions<T> =
  /** O dono está na URL (`/users/:id`): autoriza e só então busca. */
  | (AuthorizeThenLoadBase<T> & { mode: "owner-in-url"; ownerId: string })
  /** Não há dono: a posse da feature é a checagem inteira. */
  | (AuthorizeThenLoadBase<T> & { mode: "no-owner" })
  /**
   * O dono só aparece no registro (`/customers/:customerId` traz o id do
   * *perfil*, não o do usuário), então buscar primeiro é inevitável — e o que
   * preserva a invariante é **falhar fechado**: sem `:others`, um alvo que não
   * existe responde exatamente como o alheio.
   */
  | (AuthorizeThenLoadBase<T> & {
      mode: "fail-closed";
      ownerOf: (record: T) => string | undefined;
    });

function orNotFound<T>(record: T | null, notFound: NotFoundContent): T {
  if (record === null) throw createNotFoundError(notFound);

  return record;
}

/**
 * Autorizar **antes** de carregar, como uma operação só.
 *
 * `apps/api/docs/adr/0011-autorizacao-sempre-antes-busca.md` é invariante de
 * segurança, não estilo: quem busca primeiro conta a quem não tem `:others` se
 * um id existe. Enquanto a ordem era hábito, cada serviço a reescrevia à mão e
 * um call site novo podia invertê-la sem nada reclamar. Aqui ela é estrutura —
 * quem chama não tem como pedir a ordem errada, porque não tem como pedir a
 * ordem.
 *
 * O módulo recebe o `load` em vez de buscar: `src/lib/` não conhece repository
 * (`apps/api/docs/adr/0100-src-lib-nao-conhece-modulo-nenhum.md`).
 */
export async function authorizeThenLoad<T>(
  options: AuthorizeThenLoadOptions<T>,
): Promise<T> {
  const features = Array.isArray(options.feature)
    ? options.feature
    : [options.feature];

  if (options.mode === "fail-closed") {
    const record = await options.load();
    const ownerId = record === null ? undefined : options.ownerOf(record);

    // `ownerId === actor.id` passa sem reexigir a feature base: o porteiro da
    // rota já a exigiu na forma frouxa, e é ele quem separa quem entra.
    const allowed = features.some(
      (feature) =>
        hasFeature(options.actor, othersOf(feature)) ||
        (ownerId !== undefined && ownerId === options.actor.id),
    );

    if (!allowed) {
      throw createFeatureForbiddenError(features.map(othersOf));
    }

    return orNotFound(record, options.notFound);
  }

  if (options.mode === "owner-in-url") {
    assertCanActOnResource(options.actor, features, options.ownerId);
  } else {
    assertHasAnyFeature(options.actor, features);
  }

  return orNotFound(await options.load(), options.notFound);
}

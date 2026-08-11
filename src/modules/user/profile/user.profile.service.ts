import {
  createConflictError,
  createForbiddenError,
  createNotFoundError,
} from "@/errors/errorFactory";
import type { ProfileKind } from "@/generated/prisma/enums";
import type { AuditDescriptor } from "@/lib/auditLog";
import {
  type AuthUser,
  canActOnResource,
  hasFeature,
} from "@/lib/authorization";
import { assertAdminForRoleAssignment } from "@/modules/permission/permission.service";
import type { RoleName } from "@/modules/role/role.constants";
import { getRolesByNames } from "@/modules/role/role.repository";
import { validateRoles } from "@/utils/validateRoles";
import type { CascadeCounts } from "../user.lifecycle.repository";
import { findUserById } from "../user.repository";
import * as userProfileRepository from "./user.profile.repository";
import type {
  CreateCustomerProfileInput,
  CreateEmployeeProfileInput,
} from "./user.profile.schema";

const DEFAULT_CUSTOMER_ROLES: RoleName[] = ["customer"];
const DEFAULT_EMPLOYEE_ROLES: RoleName[] = ["attendant"];

const FORBIDDEN_MESSAGE = "Você não tem permissão para acessar este recurso";

const describeFeatures = (features: string[]) =>
  features.length === 1
    ? `Verifique se você tem acesso a feature "${features[0]}"`
    : `Verifique se você tem acesso a uma das features: ${features
        .map((feature) => `"${feature}"`)
        .join(", ")}`;

/**
 * Autorização do perfil de **cliente**, que tem par self/`:others` — o ator age
 * sobre si mesmo sempre, sobre terceiros só com a versão `:others`.
 *
 * A mensagem nomeia a variante que faltou de verdade: pedir `:others` a quem
 * está agindo sobre a própria conta mandaria o usuário atrás da feature errada.
 */
function assertCanActOnCustomerProfile(
  actor: AuthUser,
  targetUserId: string,
  features: string[],
) {
  if (features.some((f) => canActOnResource(actor, f, targetUserId))) return;

  const scope = (feature: string) =>
    actor.id === targetUserId ? feature : `${feature}:others`;

  throw createForbiddenError({
    message: FORBIDDEN_MESSAGE,
    action: describeFeatures(features.map(scope)),
  });
}

/**
 * Autorização do perfil de **funcionário**. Sem par self/`:others` de propósito:
 * nunca há self-service para virar funcionário (D11), então a feature já é, por
 * definição, a de agir sobre outro — e `canActOnResource` aqui restringiria ao
 * próprio, que é o oposto do pretendido.
 */
function assertCanActOnEmployeeProfile(actor: AuthUser, features: string[]) {
  if (features.some((feature) => hasFeature(actor, feature))) return;

  throw createForbiddenError({
    message: FORBIDDEN_MESSAGE,
    action: describeFeatures(features),
  });
}

const describeProfileCreation =
  (userId: string, profileKind: ProfileKind) =>
  (roles: number): AuditDescriptor => ({
    action: "USER_PROFILE_CREATED",
    targetType: "User",
    targetId: userId,
    metadata: { profileKind, roles },
  });

const describeProfileRestoration =
  (userId: string, profileKind: ProfileKind, grantedRoles: number) =>
  ({ restoredRoles }: { restoredRoles: number }): AuditDescriptor => ({
    action: "USER_PROFILE_RESTORED",
    targetType: "User",
    targetId: userId,
    // Restaurada ≠ concedida: a primeira voltou por correlação de data, a
    // segunda foi decisão do ator. Só a segunda é autoridade nova.
    metadata: { profileKind, restoredRoles, grantedRoles },
  });

/**
 * Descritor do audit da deleção de perfil (K8). O ator sai do request context
 * dentro do `record()`, então o service não precisa recebê-lo.
 */
const describeProfileDeletion =
  (userId: string, profileKind: ProfileKind) =>
  ({ roles, overrides }: CascadeCounts): AuditDescriptor => ({
    action: "USER_PROFILE_DELETED",
    targetType: "User",
    targetId: userId,
    // A cascata derruba roles e overrides sem nada aparecer no 204; as
    // contagens são o único rastro do que se perdeu (mesmo critério do K6).
    metadata: {
      profileKind,
      cascadedRoles: roles,
      cascadedOverrides: overrides,
    },
  });

/**
 * Cria **ou** reativa o perfil de cliente (§5.1) — a rota é uma só e o ramo sai
 * do estado do perfil no banco.
 *
 * A autorização é em duas etapas: primeiro a união das duas features, **antes**
 * de buscar o usuário (403 vence 404 — a autorização não pode depender de o
 * alvo existir); depois a feature específica do ramo que de fato correu, senão
 * ter só `reactivate:` deixaria criar do zero.
 */
export async function createCustomerProfile(
  actor: AuthUser,
  userId: string,
  data: CreateCustomerProfileInput,
) {
  assertCanActOnCustomerProfile(actor, userId, [
    "create:customer-profile",
    "reactivate:customer-profile",
  ]);

  const user = await findUserById(userId);

  if (!user) {
    throw createNotFoundError({
      message: "Usuário não encontrado",
      action: "Verifique o ID do usuário",
    });
  }

  if (user.customer && user.customer.deletedAt === null) {
    throw createConflictError({
      message: "Usuário já possui um perfil de cliente",
      action: "Verifique o perfil do usuário",
    });
  }

  if (user.customer) {
    assertCanActOnCustomerProfile(actor, userId, [
      "reactivate:customer-profile",
    ]);

    // Sem escolha de roles: o perfil de cliente tem uma só, então vale o default
    // do D8 — volta o que morreu na cascata dele.
    return await userProfileRepository.reactivateProfile(
      userId,
      "CUSTOMER",
      { phone: data.phone },
      describeProfileRestoration(userId, "CUSTOMER", 0),
    );
  }

  assertCanActOnCustomerProfile(actor, userId, ["create:customer-profile"]);

  const rolesList = await getRolesByNames(DEFAULT_CUSTOMER_ROLES);

  validateRoles(rolesList, "CUSTOMER");

  return await userProfileRepository.createCustomerProfile(
    userId,
    data,
    rolesList.map((role) => role.id),
    describeProfileCreation(userId, "CUSTOMER")(rolesList.length),
  );
}

/**
 * Cria **ou** reativa o perfil de funcionário. Mesma forma da versão de cliente,
 * com duas diferenças: nunca há self-service (D11) e o `roleNames` é a lista de
 * roles com que o perfil nasce **ou volta** (K15).
 */
export async function createEmployeeProfile(
  actor: AuthUser,
  userId: string,
  data: CreateEmployeeProfileInput,
) {
  assertCanActOnEmployeeProfile(actor, [
    "create:employee-profile",
    "reactivate:employee-profile",
  ]);

  const user = await findUserById(userId);

  if (!user) {
    throw createNotFoundError({
      message: "Usuário não encontrado",
      action: "Verifique o ID do usuário",
    });
  }

  if (user.employee && user.employee.deletedAt === null) {
    throw createConflictError({
      message: "Usuário já possui um perfil de funcionário",
      action: "Verifique o perfil do usuário",
    });
  }

  const rolesList = data.roleNames
    ? await getRolesByNames(data.roleNames)
    : await getRolesByNames(DEFAULT_EMPLOYEE_ROLES);

  validateRoles(rolesList, "EMPLOYEE");

  // Conceder role por aqui é conceder role — o mesmo guard de não-escalação do
  // `addUserRole` tem de valer, senão o perfil vira uma porta lateral para
  // atribuir uma role privilegiada.
  for (const role of rolesList) {
    await assertAdminForRoleAssignment(actor.id, role);
  }

  if (user.employee) {
    assertCanActOnEmployeeProfile(actor, ["reactivate:employee-profile"]);

    // `roleNames` explícito = as roles com que o perfil volta (K15). Ausente =
    // default do D8, tudo o que morreu na cascata.
    const roleIds = data.roleNames
      ? rolesList.map((role) => role.id)
      : undefined;

    return await userProfileRepository.reactivateProfile(
      userId,
      "EMPLOYEE",
      { ...(roleIds && { roleIds }) },
      describeProfileRestoration(userId, "EMPLOYEE", roleIds?.length ?? 0),
    );
  }

  assertCanActOnEmployeeProfile(actor, ["create:employee-profile"]);

  return await userProfileRepository.createEmployeeProfile(
    userId,
    rolesList.map((role) => role.id),
    describeProfileCreation(userId, "EMPLOYEE")(rolesList.length),
  );
}

export async function deleteCustomerProfile(userId: string) {
  const user = await findUserById(userId);

  if (!user) {
    throw createNotFoundError({
      message: "Usuário não encontrado",
      action: "Verifique o ID do usuário",
    });
  }

  if (!user.customer) {
    throw createNotFoundError({
      message: "Perfil de cliente não encontrado",
      action: "Verifique o perfil do usuário",
    });
  }

  if (user.customer.deletedAt !== null) {
    throw createConflictError({
      message: "Perfil de cliente já está inativo",
      action: "Verifique o perfil do usuário",
    });
  }

  const hasActiveEmployee =
    user.employee !== null && user.employee.deletedAt === null;

  if (!hasActiveEmployee) {
    throw createConflictError({
      message: "Não é possível deletar o último perfil do usuário",
      action: "Para excluir esse perfil use o endpoint de deleção de usuário.",
    });
  }

  return userProfileRepository.deleteCustomerProfile(
    userId,
    describeProfileDeletion(userId, "CUSTOMER"),
  );
}

export async function deleteEmployeeProfile(userId: string) {
  const user = await findUserById(userId);

  if (!user) {
    throw createNotFoundError({
      message: "Usuário não encontrado",
      action: "Verifique o ID do usuário",
    });
  }

  if (!user.employee) {
    throw createNotFoundError({
      message: "Perfil de funcionário não encontrado",
      action: "Verifique o perfil do usuário",
    });
  }

  if (user.employee.deletedAt !== null) {
    throw createConflictError({
      message: "Perfil de funcionário já está inativo",
      action: "Verifique o perfil do usuário",
    });
  }

  const hasActiveCustomer =
    user.customer !== null && user.customer.deletedAt === null;

  if (!hasActiveCustomer) {
    throw createConflictError({
      message: "Não é possível deletar o último perfil do usuário",
      action: "Para excluir esse perfil use o endpoint de deleção de usuário.",
    });
  }

  return userProfileRepository.deleteEmployeeProfile(
    userId,
    describeProfileDeletion(userId, "EMPLOYEE"),
  );
}

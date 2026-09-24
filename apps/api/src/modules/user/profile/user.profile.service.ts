import type { RoleName } from "@pet-oasis/api-contracts/role";
import type {
  CreateCustomerProfileInput,
  CreateEmployeeProfileInput,
} from "@pet-oasis/api-contracts/user";
import {
  createConflictError,
  createNotFoundError,
} from "@/errors/errorFactory";
import type { ProfileKind } from "@/generated/prisma/enums";
import type { AuditDescriptor } from "@/lib/auditLog";
import {
  type AuthUser,
  assertCanActOnResource,
  assertHasAnyFeature,
  authorizeThenLoad,
} from "@/lib/authorization";
import { assertAdminForRoleAssignment } from "@/modules/permission/permission.service";
import { getRolesByNames } from "@/modules/role/role.repository";
import { validateRoles } from "@/utils/validateRoles";
import type { CascadeCounts } from "../user.lifecycle.repository";
import { findUserById } from "../user.repository";
import * as userProfileRepository from "./user.profile.repository";

const DEFAULT_CUSTOMER_ROLES: RoleName[] = ["customer"];
const DEFAULT_EMPLOYEE_ROLES: RoleName[] = ["attendant"];

/**
 * O 404 de usuário **das rotas de perfil**. A ação difere da do módulo de
 * usuário ("Verifique o ID e tente novamente") porque a resposta destas rotas
 * sempre foi assim; unificar as duas mudaria corpo já publicado.
 */
const USER_NOT_FOUND = {
  message: "Usuário não encontrado",
  action: "Verifique o ID do usuário",
};

/**
 * Autoriza e **então** carrega o alvo do perfil de **cliente**, que tem par
 * self/`:others` — o ator age sobre si mesmo sempre, sobre terceiros só com a
 * versão `:others`. O dono é o próprio id da URL, daí o modo `owner-in-url`.
 */
const loadUserForCustomerProfile = (
  actor: AuthUser,
  targetUserId: string,
  features: string[],
) =>
  authorizeThenLoad({
    actor,
    feature: features,
    mode: "owner-in-url",
    ownerId: targetUserId,
    load: () => findUserById(targetUserId),
    notFound: USER_NOT_FOUND,
  });

/**
 * O mesmo para o perfil de **funcionário**, no modo `no-owner`: nunca há
 * self-service para virar funcionário (D11), então a feature já é, por
 * definição, a de agir sobre outro — o par self/`:others` restringiria ao
 * próprio, que é o oposto do pretendido.
 */
const loadUserForEmployeeProfile = (
  actor: AuthUser,
  targetUserId: string,
  features: string[],
) =>
  authorizeThenLoad({
    actor,
    feature: features,
    mode: "no-owner",
    load: () => findUserById(targetUserId),
    notFound: USER_NOT_FOUND,
  });

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
  ({
    restoredRoles,
    restoredPets,
  }: {
    restoredRoles: number;
    restoredPets: number;
  }): AuditDescriptor => ({
    action: "USER_PROFILE_RESTORED",
    targetType: "User",
    targetId: userId,
    // Restaurada ≠ concedida: a primeira voltou por correlação de data, a
    // segunda foi decisão do ator. Só a segunda é autoridade nova.
    metadata: { profileKind, restoredRoles, grantedRoles, restoredPets },
  });

/**
 * Descritor do audit da deleção de perfil (K8). O ator sai do request context
 * dentro do `record()`, então o service não precisa recebê-lo.
 */
const describeProfileDeletion =
  (userId: string, profileKind: ProfileKind) =>
  ({ roles, overrides, pets }: CascadeCounts): AuditDescriptor => ({
    action: "USER_PROFILE_DELETED",
    targetType: "User",
    targetId: userId,
    // A cascata derruba roles e overrides sem nada aparecer no 204; as
    // contagens são o único rastro do que se perdeu (mesmo critério do K6).
    metadata: {
      profileKind,
      cascadedRoles: roles,
      cascadedOverrides: overrides,
      // Só o perfil de cliente tem pet; no de funcionário isto é sempre 0.
      cascadedPets: pets,
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
  const user = await loadUserForCustomerProfile(actor, userId, [
    "create:customer-profile",
    "reactivate:customer-profile",
  ]);

  if (user.customer && user.customer.deletedAt === null) {
    throw createConflictError({
      message: "Usuário já possui um perfil de cliente",
      action: "Verifique o perfil do usuário",
    });
  }

  if (user.customer) {
    assertCanActOnResource(actor, ["reactivate:customer-profile"], userId);

    // Sem escolha de roles: o perfil de cliente tem uma só, então vale o default
    // do D8 — volta o que morreu na cascata dele.
    return await userProfileRepository.reactivateProfile(
      userId,
      "CUSTOMER",
      { phone: data.phone },
      describeProfileRestoration(userId, "CUSTOMER", 0),
    );
  }

  assertCanActOnResource(actor, ["create:customer-profile"], userId);

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
  const user = await loadUserForEmployeeProfile(actor, userId, [
    "create:employee-profile",
    "reactivate:employee-profile",
  ]);

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
    assertHasAnyFeature(actor, ["reactivate:employee-profile"]);

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

  assertHasAnyFeature(actor, ["create:employee-profile"]);

  return await userProfileRepository.createEmployeeProfile(
    userId,
    rolesList.map((role) => role.id),
    describeProfileCreation(userId, "EMPLOYEE")(rolesList.length),
  );
}

export async function deleteCustomerProfile(userId: string) {
  const user = await findUserById(userId);

  if (!user) {
    throw createNotFoundError(USER_NOT_FOUND);
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
    throw createNotFoundError(USER_NOT_FOUND);
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

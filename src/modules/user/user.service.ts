import {
  createConflictError,
  createForbiddenError,
  createNotFoundError,
  createValidationError,
} from "@/errors";
import type { ProfileKind } from "@/generated/prisma/enums";
import type { AuthUser } from "@/lib/authorization";
import {
  assertActorIsAdmin,
  canActOnResource,
  computeEffectiveFeatures,
} from "@/lib/authorization";
import { send } from "@/lib/email";
import * as lockout from "@/lib/lockout";
import { logger } from "@/lib/logger";
import { buildOffsetArgs } from "@/lib/pagination";
import { hashPassword } from "@/lib/password";
import { generateOpaqueToken, hashToken } from "@/lib/token";
import * as userRepository from "@/modules/user/user.repository";
import type {
  CreateCustomerInput,
  CreateEmployeeInput,
  ListUsersQuery,
  UpdateUserInput,
} from "@/modules/user/user.schema";
import { validateRoles } from "@/utils/validateRoles";
import { requestAccountReactivation } from "../auth/accountReactivation.service";
import { PASSWORD_RESET_TTL_MS } from "../auth/auth.constants";
import { buildPasswordResetEmail } from "../auth/password.service";
import { issueEmailVerification } from "../auth/verification.service";
import {
  assertAdminForRoleAssignment,
  getRolesRestorableWithProfiles,
} from "../permission/permission.service";
import { PERMISSION_FEATURES, type RoleName } from "../role/role.constants";
import { getRolesByNames } from "../role/role.repository";

const log = logger.child({ module: "user" });

export const DEFAULT_EMPLOYEE_ROLES: RoleName[] = ["attendant"];
export const DEFAULT_CUSTOMER_ROLES: RoleName[] = ["customer"];

/** Como a conta nasceu, para o audit distinguir signup de criação por admin. */
export type UserCreationSource = "SIGNUP" | "ADMIN";

export async function createEmployee(
  requestingUserId: string,
  data: CreateEmployeeInput,
  source: UserCreationSource = "ADMIN",
) {
  const rolesList = data.roleNames
    ? await getRolesByNames(data.roleNames)
    : await getRolesByNames(DEFAULT_EMPLOYEE_ROLES);

  validateRoles(rolesList, "EMPLOYEE");

  // Nascer com a role é ser atribuído a ela: sem este guard, criar o usuário
  // já com `roleNames: ["admin"]` seria um desvio de
  // `POST /users/:id/roles/:roleId`, que exige ator admin para role
  // privilegiada. Furo pré-existente, fechado junto da 8.3 porque a rota de
  // perfil tinha o gêmeo exato dele.
  for (const role of rolesList) {
    await assertAdminForRoleAssignment(requestingUserId, role);
  }

  const { password, ...userData } = data;

  const passwordHash = await hashPassword(password);

  const user = await userRepository.createEmployee(
    {
      ...userData,
      passwordHash,
      roleNames: rolesList.map((r) => r.name as RoleName),
    },
    { action: "USER_CREATED", targetType: "User", metadata: { source } },
  );

  log.info(
    {
      userId: user.id,
      profile: "EMPLOYEE",
      roles: rolesList.map((r) => r.name),
    },
    "user created",
  );

  await issueEmailVerification(user.id, user.email);

  return user;
}

const EMAIL_IN_USE_ERROR = {
  message: "O email informado já está em uso",
  action: "Tente outro valor para o campo email",
};

/**
 * Decide, para o signup de cliente, entre criar conta nova, recusar e reativar.
 *
 * Os três ramos de recusa devolvem **a mesma** mensagem de propósito: só o email
 * bater não prova identidade (cpf não é segredo, mas conhecer os dois já é
 * evidência suficiente para disparar um email ao dono), e uma resposta
 * diferente por caso revelaria que a conta existe e em que estado ela está.
 *
 * D12: conta **ativa** nunca é tocada — nem vinculada, nem alterada. O caminho
 * de quem tem uma conta viva é logar.
 *
 * D13 (8.6): só o email **atual** de uma conta é reservado. Um endereço que a
 * conta já largou (`PreviousEmail`) não entra em nenhum destes ramos — é
 * histórico, não reserva.
 */
async function resolveCustomerSignupEmail(
  email: string,
  cpf: string,
): Promise<{ reactivationTriggered: boolean }> {
  if (await userRepository.findUserByEmail(email)) {
    throw createConflictError(EMAIL_IN_USE_ERROR);
  }

  const deletedUser = await userRepository.findDeletedUserByEmail(email);

  if (!deletedUser) return { reactivationTriggered: false };

  if (deletedUser.cpf !== cpf || deletedUser.bannedAt !== null) {
    throw createConflictError(EMAIL_IN_USE_ERROR);
  }

  // Self-service traz **apenas** o perfil de cliente (D11); roles vazias = o
  // default do D8, todas as que morreram na cascata.
  await requestAccountReactivation(deletedUser, "SELF", {
    profiles: ["CUSTOMER"],
    roleIds: [],
  });

  return { reactivationTriggered: true };
}

/**
 * Devolve `null` quando o email pertencia a uma conta soft-deletada e o cpf
 * bateu: nesse caso nada é criado, um email de reativação sai, e o controller
 * responde 202 (K18).
 */
export async function createCustomer(
  data: CreateCustomerInput,
  source: UserCreationSource = "SIGNUP",
) {
  const rolesList = await getRolesByNames(DEFAULT_CUSTOMER_ROLES);

  validateRoles(rolesList, "CUSTOMER");

  const { reactivationTriggered } = await resolveCustomerSignupEmail(
    data.email,
    data.cpf,
  );

  if (reactivationTriggered) return null;

  const { password, ...userData } = data;

  const passwordHash = await hashPassword(password);

  const user = await userRepository.createCustomer(
    {
      ...userData,
      passwordHash,
      roleNames: rolesList.map((r) => r.name as RoleName),
    },
    { action: "USER_CREATED", targetType: "User", metadata: { source } },
  );

  log.info({ userId: user.id, profile: "CUSTOMER" }, "user created");

  await issueEmailVerification(user.id, user.email);

  return user;
}

export async function getUserById(requestingUser: AuthUser, targetId: string) {
  if (!canActOnResource(requestingUser, "read:user", targetId)) {
    throw createForbiddenError({
      message: "Você não tem permissão para acessar este recurso",
      action: 'Verifique se você tem acesso a feature "read:user:others"',
    });
  }

  const user = await userRepository.findUserById(targetId);

  if (!user) {
    throw createNotFoundError({
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  }

  return user;
}

export async function getUserByEmail(
  requestingUser: AuthUser,
  targetEmail: string,
) {
  const user = await userRepository.findUserByEmail(targetEmail);

  if (!user) {
    throw createNotFoundError({
      message: "Usuário não encontrado",
      action: "Verifique o email e tente novamente",
    });
  }

  if (!canActOnResource(requestingUser, "read:user", user.id)) {
    throw createForbiddenError({
      message: "Você não tem permissão para acessar este recurso",
      action: 'Verifique se você tem acesso a feature "read:user"',
    });
  }

  return user;
}

export async function getAllUsers(query: ListUsersQuery) {
  const { skip, take } = buildOffsetArgs(query);

  return userRepository.findAllUsers(
    { status: query.status, banned: query.banned, role: query.role },
    { skip, take },
  );
}

export async function updateUser(
  requestingUser: AuthUser,
  targetId: string,
  data: UpdateUserInput,
) {
  if (!canActOnResource(requestingUser, "update:user", targetId)) {
    throw createForbiddenError({
      message: "Você não tem permissão para acessar este recurso",
      action: 'Verifique se você tem acesso a feature "update:user:others"',
    });
  }

  const user = await userRepository.findUserById(targetId);

  if (!user) {
    throw createNotFoundError({
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  }

  return userRepository.updateUser(targetId, data);
}

export async function deleteUser(requestingUser: AuthUser, targetId: string) {
  if (!canActOnResource(requestingUser, "delete:user", targetId)) {
    throw createForbiddenError({
      message: "Você não tem permissão para acessar este recurso",
      action: 'Verifique se você tem acesso a feature "delete:user:others"',
    });
  }

  const user = await userRepository.findUserById(targetId);

  if (!user) {
    throw createNotFoundError({
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  }

  const deleted = await userRepository.softDeleteUserAndInvalidateSessions(
    targetId,
    ({ profiles, roles, overrides }) => ({
      action: "USER_DELETED",
      targetType: "User",
      targetId,
      // O grafo inteiro morre junto (D1); as contagens deixam o efeito visível
      // na trilha sem gerar uma linha por filho (mesmo critério do K6).
      metadata: {
        cascadedProfiles: profiles,
        cascadedRoles: roles,
        cascadedOverrides: overrides,
      },
    }),
  );

  log.info(
    { userId: targetId, actorId: requestingUser.id },
    "user soft deleted, all sessions invalidated",
  );

  return deleted;
}

type UserForFeatureComputation = NonNullable<
  Awaited<ReturnType<typeof userRepository.getUserForFeatureComputation>>
>;

/**
 * Guarda de não-escalação reusada por ban/unban e lock/unlock: agir sobre um
 * alvo privilegiado (features de `PERMISSION_FEATURES` ou `*`) exige ator
 * admin. Cada chamador passa sua própria mensagem — o predicado é o mesmo,
 * o texto exibido não.
 */
async function assertAdminForPrivilegedTarget(
  requestingUserId: string,
  target: UserForFeatureComputation,
  guardMessage: { message: string; action: string },
) {
  const effectiveFeatures = computeEffectiveFeatures(target);

  const isPrivileged =
    effectiveFeatures.has("*") ||
    PERMISSION_FEATURES.some((feature) => effectiveFeatures.has(feature));

  if (!isPrivileged) return;

  const requestingUser = await userRepository.findUserById(requestingUserId);

  assertActorIsAdmin(requestingUser, guardMessage);
}

export async function banUser(
  requestingUserId: string,
  targetId: string,
  reason: string,
) {
  if (requestingUserId === targetId) {
    throw createConflictError({
      message: "Não é possível banir a si mesmo",
      action: "Peça a outro administrador que faça essa alteração",
    });
  }

  const target = await userRepository.getUserForFeatureComputation(targetId);

  if (!target) {
    throw createNotFoundError({
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  }

  await assertAdminForPrivilegedTarget(requestingUserId, target, {
    message: "Apenas administradores podem banir usuários privilegiados",
    action: "Solicite a um administrador que faça essa alteração",
  });

  if (target.bannedAt !== null) {
    throw createConflictError({
      message: "Usuário já está banido",
      action: "Verifique o estado do usuário",
    });
  }

  const banned = await userRepository.banUserAndInvalidateSessions(
    targetId,
    requestingUserId,
    reason,
    {
      action: "USER_BANNED",
      targetType: "User",
      targetId,
      // O texto do motivo é PII e não entra no metadata (§4.4); só o fato.
      metadata: { reasonProvided: reason.length > 0 },
    },
  );

  // O texto do motivo não entra na linha: fica no banco, para quem tem
  // permissão de ler o usuário.
  log.info(
    { userId: targetId, actorId: requestingUserId },
    "user banned, all sessions invalidated",
  );

  return banned;
}

export async function unbanUser(requestingUserId: string, targetId: string) {
  if (requestingUserId === targetId) {
    throw createConflictError({
      message: "Não é possível desbanir a si mesmo",
      action: "Peça a outro administrador que faça essa alteração",
    });
  }

  const target = await userRepository.getUserForFeatureComputation(targetId);

  if (!target) {
    throw createNotFoundError({
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  }

  await assertAdminForPrivilegedTarget(requestingUserId, target, {
    message: "Apenas administradores podem banir usuários privilegiados",
    action: "Solicite a um administrador que faça essa alteração",
  });

  if (target.bannedAt === null) {
    throw createConflictError({
      message: "Usuário não está banido",
      action: "Verifique o estado do usuário",
    });
  }

  const unbanned = await userRepository.unbanUser(targetId, {
    action: "USER_UNBANNED",
    targetType: "User",
    targetId,
  });

  log.info({ userId: targetId, actorId: requestingUserId }, "user unbanned");

  return unbanned;
}

export async function unlockAccount(
  requestingUserId: string,
  targetId: string,
) {
  if (requestingUserId === targetId) {
    throw createConflictError({
      message: "Não é possível desbloquear a si mesmo",
      action: "Peça a outro administrador que faça essa alteração",
    });
  }

  const target = await userRepository.getUserForFeatureComputation(targetId);

  if (!target) {
    throw createNotFoundError({
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  }

  await assertAdminForPrivilegedTarget(requestingUserId, target, {
    message: "Apenas administradores podem desbloquear usuários privilegiados",
    action: "Solicite a um administrador que faça essa alteração",
  });

  const cleared = await lockout.clearLockout(targetId, "ADMIN");

  if (!cleared) {
    throw createConflictError({
      message: "Conta não está travada",
      action: "Verifique o estado da conta",
    });
  }

  log.info({ userId: targetId, actorId: requestingUserId }, "account unlocked");
}

/**
 * Admin dispara a reativação de uma conta soft-deletada, escolhendo perfis e —
 * opcionalmente — roles (D8/K19). Não reativa nada: emite o token e manda o
 * email, e quem conclui é o dono da conta, definindo a senha nova (K17).
 *
 * **Não-escalação (K22):** o guard corre sobre as roles que de fato vão voltar —
 * as nomeadas, ou, no default, as que morreram com cada perfil. Roda antes de
 * qualquer escrita, então um manager barrado não deixa nem token nem email para
 * trás. É o mesmo `assertAdminForRoleAssignment` da atribuição de role e da
 * reativação de perfil (8.3): uma conta que volta com `admin` é alguém sendo
 * atribuído a `admin`.
 *
 * O molde `assertAdminForPrivilegedTarget` (ban/lock) não serve aqui: ele lê as
 * features **efetivas** do alvo, e num alvo morto todas as roles estão
 * soft-deletadas — o conjunto sairia vazio e o guard passaria sempre.
 */
export async function reactivateAccount(
  requestingUserId: string,
  targetId: string,
  choice: { profiles: ProfileKind[]; roleNames?: RoleName[] },
) {
  const target = await userRepository.findDeletedUserById(targetId);

  // Conta viva também cai aqui: não é uma conta deletada, e dizer "existe mas
  // está ativa" seria contar sobre uma conta que o ator talvez nem possa ver.
  if (!target) {
    throw createNotFoundError({
      message: "Usuário excluído não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  }

  if (target.bannedAt !== null) {
    throw createConflictError({
      message: "Não é possível reativar uma conta banida",
      action: "Remova o banimento antes de reativar a conta",
    });
  }

  const claimedProfiles = choice.profiles.map((kind) => ({
    kind,
    deletedAt:
      kind === "CUSTOMER"
        ? (target.customer?.deletedAt ?? null)
        : (target.employee?.deletedAt ?? null),
  }));

  // Restaurar um perfil que nunca existiu é impossível, e criar do zero só vale
  // para o de cliente (§5.2): virar funcionário é ato próprio, com a conta viva.
  const impossible = claimedProfiles.filter(
    ({ kind, deletedAt }) => kind === "EMPLOYEE" && deletedAt === null,
  );

  if (impossible.length > 0) {
    throw createValidationError({
      errors: {
        profiles: [
          "A conta nunca teve perfil de funcionário; crie-o com a conta já ativa",
        ],
      },
    });
  }

  const rolesList = choice.roleNames
    ? await getRolesByNames(choice.roleNames)
    : await getRolesRestorableWithProfiles(
        targetId,
        claimedProfiles.filter(
          (profile): profile is { kind: ProfileKind; deletedAt: Date } =>
            profile.deletedAt !== null,
        ),
      );

  // Uma role só volta se o perfil dela voltar junto — senão a conta ficaria com
  // uma atribuição ativa sob um perfil morto, o oposto do D1.
  if (choice.roleNames) {
    for (const kind of ["CUSTOMER", "EMPLOYEE"] as const) {
      const roles = rolesList.filter((role) => role.appliesTo === kind);

      if (roles.length > 0 && !choice.profiles.includes(kind)) {
        throw createValidationError({
          errors: {
            roleNames: [
              `As roles ${roles.map((r) => r.name).join(", ")} exigem que o perfil correspondente seja restaurado`,
            ],
          },
        });
      }
    }
  }

  for (const role of rolesList) {
    await assertAdminForRoleAssignment(requestingUserId, role);
  }

  await requestAccountReactivation(target, "ADMIN", {
    profiles: choice.profiles,
    roleIds: choice.roleNames ? rolesList.map((role) => role.id) : [],
  });

  log.info(
    {
      userId: targetId,
      actorId: requestingUserId,
      profiles: choice.profiles,
    },
    "account reactivation forced",
  );
}

export async function forcePasswordReset(
  requestingUserId: string,
  targetId: string,
) {
  if (requestingUserId === targetId) {
    throw createConflictError({
      message: "Não é possível forçar a própria troca de senha",
      action: "Use POST /auth/change-password para trocar sua própria senha",
    });
  }

  const target = await userRepository.getUserForFeatureComputation(targetId);

  if (!target) {
    throw createNotFoundError({
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  }

  await assertAdminForPrivilegedTarget(requestingUserId, target, {
    message:
      "Apenas administradores podem forçar troca de senha de usuários privilegiados",
    action: "Solicite a um administrador que faça essa alteração",
  });

  if (target.mustChangePassword) {
    throw createConflictError({
      message: "Troca de senha já foi forçada para este usuário",
      action: "Verifique o estado do usuário",
    });
  }

  const rawToken = generateOpaqueToken();

  await userRepository.forcePasswordResetAndInvalidateSessions(
    targetId,
    hashToken(rawToken),
    new Date(Date.now() + PASSWORD_RESET_TTL_MS),
    { action: "PASSWORD_CHANGE_FORCED", targetType: "User", targetId },
  );

  const { subject, html, text } = buildPasswordResetEmail(rawToken);

  await send({ to: target.email, subject, html, text });

  log.info(
    { userId: targetId, actorId: requestingUserId },
    "password change forced, all sessions invalidated",
  );
}

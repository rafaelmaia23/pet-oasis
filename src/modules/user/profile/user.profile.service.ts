import {
  createConflictError,
  createNotFoundError,
} from "@/errors/errorFactory";
import type { RoleName } from "@/modules/role/role.constants";
import { getRolesByNames } from "@/modules/role/role.repository";
import { validateRoles } from "@/utils/validateRoles";
import { findUserById } from "../user.repository";
import * as userProfileRepository from "./user.profile.repository";
import type {
  CreateCustomerProfileInput,
  CreateEmployeeProfileInput,
} from "./user.profile.schema";

const DEFAULT_CUSTOMER_ROLES: RoleName[] = ["customer"];
const DEFAULT_EMPLOYEE_ROLES: RoleName[] = ["attendant"];

export async function createCustomerProfile(
  userId: string,
  data: CreateCustomerProfileInput,
) {
  const user = await findUserById(userId);

  if (!user) {
    throw createNotFoundError({
      message: "Usuário não encontrado",
      action: "Verifique o ID do usuário",
    });
  }

  if (user.customer) {
    if (user.customer.deletedAt) {
      throw createConflictError({
        message: "Usuário já possui um perfil de cliente inativo",
        action:
          "Verifique com o administrador do sistema para reativar o perfil de cliente",
      });
    }

    throw createConflictError({
      message: "Usuário já possui um perfil de cliente",
      action: "Verifique o perfil do usuário",
    });
  }

  return await userProfileRepository.createCustomerProfile(
    userId,
    data,
    DEFAULT_CUSTOMER_ROLES,
  );
}

export async function createEmployeeProfile(
  userId: string,
  data: CreateEmployeeProfileInput,
) {
  const user = await findUserById(userId);

  if (!user) {
    throw createNotFoundError({
      message: "Usuário não encontrado",
      action: "Verifique o ID do usuário",
    });
  }

  const rolesList = data.roleNames
    ? await getRolesByNames(data.roleNames)
    : await getRolesByNames(DEFAULT_EMPLOYEE_ROLES);

  validateRoles(rolesList, "EMPLOYEE");

  if (user.employee) {
    if (user.employee.deletedAt) {
      throw createConflictError({
        message: "Usuário já possui um perfil de funcionário inativo",
        action:
          "Verifique com o administrador do sistema para reativar o perfil de funcionário",
      });
    }

    throw createConflictError({
      message: "Usuário já possui um perfil de funcionário",
      action: "Verifique o perfil do usuário",
    });
  }

  return await userProfileRepository.createEmployeeProfile(
    userId,
    rolesList.map((r) => r.name),
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
      action:
        "Para excluir esse usuario use o endpoint de deleção de usuário.",
    });
  }

  return userProfileRepository.deleteCustomerProfile(userId);
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
      action:
        "Para excluir esse usuario use o endpoint de deleção de usuário.",
    });
  }

  return userProfileRepository.deleteEmployeeProfile(userId);
}

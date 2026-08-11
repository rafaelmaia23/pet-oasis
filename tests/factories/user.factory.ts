import { faker } from "@faker-js/faker";
import { cpf } from "cpf-cnpj-validator";
import { createInternalServerError } from "@/errors/errorFactory";
import type { ProfileKind, UserStatus } from "@/generated/prisma/enums";
import { type AuthUser, computeEffectiveFeatures } from "@/lib/authorization";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import type { FeatureName } from "@/modules/feature/feature.constants";
import type { RoleName } from "@/modules/role/role.constants";
import { getRolesByNames } from "@/modules/role/role.repository";
import { createCustomerProfile } from "@/modules/user/profile/user.profile.repository";
import {
  createCustomer,
  createEmployee,
  findUserById,
} from "@/modules/user/user.repository";
import {
  type CreateCustomerInput,
  type CreateEmployeeInput,
  createCustomerSchema,
  createEmployeeSchema,
} from "@/modules/user/user.schema";
import {
  DEFAULT_CUSTOMER_ROLES,
  DEFAULT_EMPLOYEE_ROLES,
} from "@/modules/user/user.service";
import { makePassword } from "../helpers/primitives";

/**
 * Pendura os overrides numa atribuição de role do usuário (D2 — override sem
 * `UserRole` não existe mais). Default: a **primeira** role do usuário; quem
 * precisar escolher passa `overrideRole`.
 */
export async function attachOverrides(
  userId: string,
  overrides: {
    grants?: FeatureName[];
    denies?: FeatureName[];
    overrideRole?: RoleName;
  },
) {
  const grants = overrides.grants ?? [];
  const denies = overrides.denies ?? [];

  if (grants.length === 0 && denies.length === 0) return;

  const userRole = await prisma.userRole.findFirst({
    where: {
      userId,
      deletedAt: null,
      ...(overrides.overrideRole && {
        role: { name: overrides.overrideRole },
      }),
    },
  });

  if (!userRole)
    throw createInternalServerError({
      message: "No active user role to attach the feature overrides to",
      action: "Verificar as roles pedidas na factory",
    });

  for (const { name, granted } of [
    ...grants.map((name) => ({ name, granted: true })),
    ...denies.map((name) => ({ name, granted: false })),
  ]) {
    await prisma.userFeature.create({
      data: {
        userRole: { connect: { id: userRole.id } },
        feature: { connect: { name } },
        granted,
      },
    });
  }
}

const makeUserData = (overrides?: Partial<CreateCustomerInput>) => {
  const rawData = {
    name: overrides?.name ?? faker.person.fullName(),
    email: overrides?.email ?? faker.internet.email(),
    cpf: overrides?.cpf ?? cpf.generate(),
    password: overrides?.password ?? makePassword(),
  };

  return rawData;
};

export const makeCustomerData = (overrides?: Partial<CreateCustomerInput>) => {
  const rawData = {
    ...makeUserData(overrides),
    phone: overrides?.phone ?? faker.phone.number({ style: "international" }),
  };

  return rawData;
};

export const makeEmployeeData = (overrides?: Partial<CreateEmployeeInput>) => {
  const rawData = {
    ...makeUserData(overrides),
    roleNames: overrides?.roleNames,
  };

  return rawData;
};

export async function buildCustomer(overrides?: {
  roleNames?: RoleName[];
  grants?: FeatureName[];
  denies?: FeatureName[];
  overrideRole?: RoleName;
  status?: UserStatus;
  data?: Partial<CreateCustomerInput>;
}) {
  const rawData = makeCustomerData(overrides?.data);

  const customerData = createCustomerSchema.shape.body.parse(rawData);

  const { password, ...userData } = customerData;

  const passwordHash = await hashPassword(password);

  const user = await createCustomer({
    ...userData,
    passwordHash,
    roleNames: overrides?.roleNames ?? DEFAULT_CUSTOMER_ROLES,
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { status: overrides?.status ?? "ACTIVE" },
  });

  //in future use permission repository instead of direct prisma access
  await attachOverrides(user.id, overrides ?? {});

  const userInDb = await findUserById(user.id);

  if (!userInDb)
    throw createInternalServerError({
      message: "User not found after creation",
      action: "Verificar processo de criação de usuário",
    });

  return { ...userInDb, password: customerData.password };
}

export async function buildEmployee(overrides?: {
  roleNames?: RoleName[];
  grants?: FeatureName[];
  denies?: FeatureName[];
  overrideRole?: RoleName;
  status?: UserStatus;
  data?: Partial<CreateEmployeeInput>;
}) {
  const rawData = makeEmployeeData(overrides?.data);

  const employeeData = createEmployeeSchema.shape.body.parse(rawData);

  const { password, ...userData } = employeeData;

  const passwordHash = await hashPassword(password);

  const user = await createEmployee({
    ...userData,
    passwordHash,
    roleNames: overrides?.roleNames ?? DEFAULT_EMPLOYEE_ROLES,
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { status: overrides?.status ?? "ACTIVE" },
  });

  //in future use permission repository instead of direct prisma access
  await attachOverrides(user.id, overrides ?? {});

  const userInDb = await findUserById(user.id);

  if (!userInDb)
    throw createInternalServerError({
      message: "User not found after creation",
      action: "Verificar processo de criação de usuário",
    });

  return { ...userInDb, password: employeeData.password };
}

/**
 * Usuário com os **dois** perfis ativos — o alvo natural dos testes de cascata,
 * que precisam provar que a deleção alcança os dois lados do grafo. Nasce
 * funcionário (para escolher as roles de EMPLOYEE) e ganha o perfil de cliente
 * pelo repositório de perfil, o mesmo caminho que o service usa.
 *
 * Os overrides não entram aqui: pendure-os depois com `attachOverrides`,
 * escolhendo a role de cada um por `overrideRole`.
 */
export async function buildHybrid(overrides?: {
  employeeRoles?: RoleName[];
  customerRoles?: RoleName[];
  data?: Partial<CreateEmployeeInput>;
}) {
  const employee = await buildEmployee({
    ...(overrides?.employeeRoles && { roleNames: overrides.employeeRoles }),
    ...(overrides?.data && { data: overrides.data }),
  });

  // O repositório passou a receber ids (8.3): as roles são concedidas pela
  // primitiva de reuso de linha, que casa pelo par `(userId, roleId)`.
  const customerRoles = await getRolesByNames(
    overrides?.customerRoles ?? DEFAULT_CUSTOMER_ROLES,
  );

  await createCustomerProfile(
    employee.id,
    { phone: faker.phone.number({ style: "international" }) },
    customerRoles.map((role) => role.id),
  );

  const userInDb = await findUserById(employee.id);

  if (!userInDb)
    throw createInternalServerError({
      message: "User not found after adding the customer profile",
      action: "Verificar processo de criação de perfil",
    });

  return { ...userInDb, password: employee.password };
}

export async function buildAuthUser(
  profileKind: ProfileKind,
  overrides?: {
    roleNames?: RoleName[];
    grants?: FeatureName[];
    denies?: FeatureName[];
  },
): Promise<AuthUser> {
  const roleNames =
    overrides?.roleNames ??
    (profileKind === "EMPLOYEE"
      ? DEFAULT_EMPLOYEE_ROLES
      : DEFAULT_CUSTOMER_ROLES);
  const roles = await getRolesByNames(roleNames);

  // Mesma convenção de `attachOverrides`: os overrides pendem da primeira role.
  const userFeatures = [
    ...(overrides?.grants ?? []).map((name) => ({
      granted: true,
      feature: { name },
    })),
    ...(overrides?.denies ?? []).map((name) => ({
      granted: false,
      feature: { name },
    })),
  ];

  const userForComputation = {
    roles: roles.map((role, index) => ({
      role: { features: role.features },
      features: index === 0 ? userFeatures : [],
    })),
  };

  return {
    id: faker.string.uuid(),
    features: computeEffectiveFeatures(userForComputation),
  };
}

export const makeAuthUser = (features: string[]): AuthUser => ({
  id: faker.string.uuid(),
  features: new Set(features),
});

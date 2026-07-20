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

  if (overrides?.grants || overrides?.denies) {
    const userFeatures = [
      ...(overrides?.grants ?? []).map((name) => ({ name, granted: true })),
      ...(overrides?.denies ?? []).map((name) => ({ name, granted: false })),
    ];

    //in future use permission repository instead of direct prisma access
    for (const { name, granted } of userFeatures) {
      await prisma.userFeature.create({
        data: {
          user: { connect: { id: user.id } },
          feature: { connect: { name } },
          granted,
        },
      });
    }
  }

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

  if (overrides?.grants || overrides?.denies) {
    const userFeatures = [
      ...(overrides?.grants ?? []).map((name) => ({ name, granted: true })),
      ...(overrides?.denies ?? []).map((name) => ({ name, granted: false })),
    ];

    //in future use permission repository instead of direct prisma access
    for (const { name, granted } of userFeatures) {
      await prisma.userFeature.create({
        data: {
          user: { connect: { id: user.id } },
          feature: { connect: { name } },
          granted,
        },
      });
    }
  }

  const userInDb = await findUserById(user.id);

  if (!userInDb)
    throw createInternalServerError({
      message: "User not found after creation",
      action: "Verificar processo de criação de usuário",
    });

  return { ...userInDb, password: employeeData.password };
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

  const userForComputation = {
    roles: roles.map((role) => ({ role: { features: role.features } })),
    features: [
      ...(overrides?.grants ?? []).map((name) => ({
        granted: true,
        feature: { name },
      })),
      ...(overrides?.denies ?? []).map((name) => ({
        granted: false,
        feature: { name },
      })),
    ],
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

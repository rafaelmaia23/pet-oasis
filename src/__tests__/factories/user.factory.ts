import { faker } from "@faker-js/faker";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import type { CreateUserInput } from "@/modules/user/user.schema";

export function makeUserData(
  overrides: Partial<CreateUserInput> = {},
): CreateUserInput {
  return {
    name: faker.person.fullName(),
    email: faker.internet.email(),
    password: faker.internet.password({
      length: 12,
      memorable: false,
      pattern: /[A-Z]/,
      prefix: "Test1@",
    }),
    ...overrides,
  };
}

export function makeUserDataWithFeatures(features: string[]) {
  return {
    id: faker.string.uuid(),
    features: features.map((name) => ({ name })),
  };
}

export async function buildUser(overrides: Partial<CreateUserInput> = {}) {
  const data = makeUserData(overrides);

  return prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      passwordHash: await hashPassword(data.password),
    },
    include: {
      features: {
        include: {
          feature: true,
        },
      },
    },
  });
}

export async function buildUserWithFeatures(
  features: string[],
  overrides: Partial<CreateUserInput> = {},
) {
  const user = await buildUser(overrides);

  const featureRecords = await prisma.feature.findMany({
    where: {
      name: {
        in: features,
      },
    },
  });

  await prisma.userFeature.createMany({
    data: featureRecords.map((feature) => ({
      userId: user.id,
      featureId: feature.id,
    })),
  });

  const { features: _, ...userWithoutFeatures } = user;

  return {
    ...userWithoutFeatures,
    features: featureRecords.map((feature) => ({ name: feature.name })),
  };
}

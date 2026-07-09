import { env } from "../src/config/env";
import { UserStatus } from "../src/generated/prisma/enums";
import { hashPassword } from "../src/lib/password";
import { prisma } from "../src/lib/prisma";
import { DEFAULT_FEATURES } from "../src/modules/feature/feature.constants";
import { DEFAULT_ROLES } from "../src/modules/role/role.constants";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// Identidade fixa do usuário demo (cpf/name não vêm do env — só email/senha públicos)
const DEMO_NAME = "Demo User";
const DEMO_CPF = "00000000000";

async function main() {
  console.log("SEEDING DATABASE STARTED...");

  await prisma.$transaction(async (tx: Tx) => {
    for (const feature of DEFAULT_FEATURES) {
      await tx.feature.upsert({
        where: { name: feature.name },
        update: {
          description: feature.description,
        },
        create: feature,
      });
    }

    for (const role of DEFAULT_ROLES) {
      await tx.role.upsert({
        where: { name: role.name },
        update: {
          description: role.description,
          appliesTo: role.appliesTo,
        },
        create: {
          name: role.name,
          description: role.description,
          appliesTo: role.appliesTo,
        },
      });

      await tx.role.update({
        where: { name: role.name },
        data: {
          features: {
            deleteMany: {},
            create: role.features.map((featureName) => ({
              feature: {
                connect: { name: featureName },
              },
            })),
          },
        },
      });
    }

    const currentFeatureNames = DEFAULT_FEATURES.map((f) => f.name);
    await tx.feature.deleteMany({
      where: { name: { notIn: currentFeatureNames } },
    });
  });

  console.log(`${DEFAULT_FEATURES.length} features sincronizadas com sucesso.`);
  console.log(`${DEFAULT_ROLES.length} roles sincronizadas com sucesso.`);

  // Usuário demo público read-only — só quando explicitamente habilitado
  // (ligado no Docker/prod; desligado em dev/test para não sujar a suíte).
  if (env.SEED_DEMO_USER) {
    const passwordHash = await hashPassword(env.DEMO_PASSWORD);

    await prisma.user.upsert({
      where: { email: env.DEMO_EMAIL },
      update: {
        name: DEMO_NAME,
        passwordHash,
        status: UserStatus.ACTIVE,
        bannedAt: null,
        bannedBy: null,
        banReason: null,
      },
      create: {
        name: DEMO_NAME,
        email: env.DEMO_EMAIL,
        cpf: DEMO_CPF,
        passwordHash,
        status: UserStatus.ACTIVE,
        employee: { create: {} },
        roles: {
          create: [{ role: { connect: { name: "demo" } } }],
        },
      },
    });

    console.log(`Usuário demo (${env.DEMO_EMAIL}) sincronizado com sucesso.`);
  }

  console.log("SEEDING COMPLETED!");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

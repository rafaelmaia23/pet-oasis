import { prisma } from "../src/lib/prisma";
import { DEFAULT_FEATURES } from "../src/modules/feature/feature.constants";
import { DEFAULT_ROLES } from "../src/modules/role/role.constants";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

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
  });

  console.log(`${DEFAULT_FEATURES.length} features sincronizadas com sucesso.`);
  console.log(`${DEFAULT_ROLES.length} roles sincronizadas com sucesso.`);
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

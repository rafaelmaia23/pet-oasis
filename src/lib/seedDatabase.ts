import { env } from "@/config/env";
import { UserStatus } from "@/generated/prisma/enums";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { seedAdminUser } from "@/lib/seed/seedAdminUser";
import { seedBreeds } from "@/lib/seed/seedBreeds";
import { seedFakeUsers } from "@/lib/seed/seedFakeUsers";
import { DEFAULT_FEATURES } from "@/modules/feature/feature.constants";
import { refreshSearchLexemes } from "@/modules/product/product.search.repository";
import { DEFAULT_ROLES } from "@/modules/role/role.constants";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// Identidade fixa do usuário demo (cpf/name não vêm do env — só email/senha públicos)
const DEMO_NAME = "Demo User";
const DEMO_CPF = "00000000000";

export type SeedResult = {
  featuresCount: number;
  rolesCount: number;
  breedsCreated: number;
  demoUserSeeded: boolean;
  adminUserSeeded: boolean;
  fakeUsersCreated: number;
};

/**
 * Sincroniza os catálogos de referência — features/roles (upsert idempotente) e
 * raças (9.3, idempotente por `skipDuplicates`) — e, se `SEED_DEMO_USER`, o
 * usuário demo. Reaproveitado por `prisma/seed.ts` (CLI) e por
 * `src/scripts/demo-reset.ts` (7.14).
 *
 * Deliberadamente sem nenhum código de nível de módulo que se auto-execute
 * (nada de `main()`/`if (isMainModule)` aqui): o tsup bundla por entry, e
 * qualquer script novo que importe `runSeed` inclui o módulo inteiro no seu
 * próprio bundle. Um guard de CLI aqui rodaria (ou colidiria com o do próprio
 * chamador) dentro do bundle de quem importa — achado depurando o
 * demo-reset, que herdava a saída/disconnect do `main()` do seed por baixo.
 */
export async function runSeed(): Promise<SeedResult> {
  let breedsCreated = 0;

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

    // Catálogo de raças (9.3) — mesma classe de dado que features/roles, por
    // isso no mesmo bloco e sem flag de env. Note que ele NÃO tem o
    // `deleteMany` reconciliador acima; o porquê está no JSDoc de seedBreeds.
    breedsCreated = await seedBreeds(tx);
  });

  let demoUserSeeded = false;

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

    demoUserSeeded = true;
  }

  // Usuário admin de teste, acesso total — NUNCA true em produção/demo
  // (diferente do demo, que é só leitura). Só dev/local.
  let adminUserSeeded = false;
  if (env.SEED_ADMIN_USER) {
    await seedAdminUser();
    adminUserSeeded = true;
  }

  // Dataset de usuários fake (customers/employees/híbridos + cenários de
  // ban/pendência/soft delete) — popula dev e o demo público.
  let fakeUsersCreated = 0;
  if (env.SEED_FAKE_DATA) {
    const fakeUsersResult = await seedFakeUsers();
    fakeUsersCreated = fakeUsersResult.createdCount;
  }

  // Por último, e sempre: o dicionário da busca (9.9/Z14) é derivado do
  // catálogo, então só faz sentido depois de tudo que possa ter mexido nele.
  // É isto que faz o `db:seed` e o `demo-reset` deixarem a correção de erro de
  // digitação funcionando — sem a chamada, a demo sobe com ela apagada.
  await refreshSearchLexemes();

  return {
    featuresCount: DEFAULT_FEATURES.length,
    rolesCount: DEFAULT_ROLES.length,
    breedsCreated,
    demoUserSeeded,
    adminUserSeeded,
    fakeUsersCreated,
  };
}

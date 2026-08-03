import { env } from "@/config/env";
import { UserStatus } from "@/generated/prisma/enums";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

// Identidade fixa, mesmo idioma do usuário demo em seedDatabase.ts — cpf
// diferente do demo (00000000000) para não colidir no @unique.
const ADMIN_NAME = "Admin Test User";
const ADMIN_CPF = "00000000001";

/**
 * Usuário de teste com acesso total (role `admin`, wildcard `*`) — diferente
 * do usuário demo (só leitura). Só chamado quando `SEED_ADMIN_USER=true`
 * (gate em runSeed/seedDatabase.ts); esta função em si é incondicional para
 * ficar testável sem depender do valor da env var.
 */
export async function seedAdminUser(): Promise<void> {
  const passwordHash = await hashPassword(env.SEED_ADMIN_PASSWORD);

  await prisma.user.upsert({
    where: { email: env.SEED_ADMIN_EMAIL },
    update: {
      name: ADMIN_NAME,
      passwordHash,
      status: UserStatus.ACTIVE,
      bannedAt: null,
      bannedBy: null,
      banReason: null,
    },
    create: {
      name: ADMIN_NAME,
      email: env.SEED_ADMIN_EMAIL,
      cpf: ADMIN_CPF,
      passwordHash,
      status: UserStatus.ACTIVE,
      employee: { create: {} },
      roles: { create: [{ role: { connect: { name: "admin" } } }] },
    },
  });
}

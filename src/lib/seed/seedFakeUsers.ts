import { cpf } from "cpf-cnpj-validator";
import { env } from "@/config/env";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { getRolesByNames } from "@/modules/role/role.repository";
import * as userProfileRepository from "@/modules/user/profile/user.profile.repository";
import * as userProfileService from "@/modules/user/profile/user.profile.service";
import * as userRepository from "@/modules/user/user.repository";
import {
  FAKE_USER_ROSTER,
  type FakeUserDefinition,
  type FakeUserTrait,
} from "./fakeUsers.constants";

export type SeedFakeUsersResult = {
  createdCount: number;
  skippedCount: number;
};

// Sem FK (idioma de User.bannedBy/AuditLog.actorId) — não há um ator humano
// real por trás de um ban aplicado pelo seed.
const SEED_ACTOR_ID = "00000000-0000-0000-0000-000000000000";

// Ignora deletedAt de propósito: `userRepository.findUserByEmail` filtra
// soft-deleted, o que quebraria a idempotência do cenário DELETED_USER (a
// checagem não acharia o registro já deletado e tentaria recriar, colidindo
// no @unique de email/cpf).
async function findAnyUserByEmail(email: string) {
  return prisma.user.findFirst({ where: { email } });
}

async function createBaseUser(def: FakeUserDefinition): Promise<string> {
  const passwordHash = await hashPassword(env.SEED_FAKE_USER_PASSWORD);

  if (def.kind === "EMPLOYEE") {
    const user = await userRepository.createEmployee({
      name: def.name,
      email: def.email,
      cpf: cpf.generate(),
      passwordHash,
      roleNames: def.roleNames,
    });
    return user.id;
  }

  // CUSTOMER e HYBRID nascem como customer; o HYBRID ganha o perfil de
  // employee depois, via o mesmo serviço do endpoint real de "adicionar
  // perfil" (Fase 2).
  const user = await userRepository.createCustomer({
    name: def.name,
    email: def.email,
    cpf: cpf.generate(),
    phone: def.phone,
    passwordHash,
    roleNames: ["customer"],
  });
  return user.id;
}

async function applyTrait(userId: string, trait: FakeUserTrait): Promise<void> {
  switch (trait) {
    case "NONE":
      await prisma.user.update({
        where: { id: userId },
        data: { status: "ACTIVE" },
      });
      return;
    case "PENDING":
      // Fica no default do schema (PENDING) — nunca verificou o email.
      return;
    case "BANNED":
      await prisma.user.update({
        where: { id: userId },
        data: { status: "ACTIVE" },
      });
      await userRepository.banUserAndInvalidateSessions(
        userId,
        SEED_ACTOR_ID,
        "Conta de demonstração — banida pelo seed de dados fake",
      );
      return;
    case "DELETED_USER":
      await prisma.user.update({
        where: { id: userId },
        data: { status: "ACTIVE" },
      });
      await userRepository.softDeleteUserAndInvalidateSessions(userId);
      return;
    case "DELETED_EMPLOYEE_PROFILE":
      await prisma.user.update({
        where: { id: userId },
        data: { status: "ACTIVE" },
      });
      await userProfileService.deleteEmployeeProfile(userId);
      return;
  }
}

/**
 * Cria o dataset de usuários fake (customers/employees/híbridos + cenários de
 * ban/pendência/soft delete) — só chamado quando `SEED_FAKE_DATA=true` (gate
 * em runSeed/seedDatabase.ts); esta função em si é incondicional para ficar
 * testável sem depender do valor da env var.
 *
 * Idempotente por email: um usuário já existente (ativo ou soft-deletado) é
 * pulado — o entrypoint de produção roda `migrate deploy → seed → start` a
 * cada boot do container, sem truncate antes, então rodar de novo não pode
 * duplicar nem colidir em constraint única.
 */
export async function seedFakeUsers(): Promise<SeedFakeUsersResult> {
  let createdCount = 0;
  let skippedCount = 0;

  for (const def of FAKE_USER_ROSTER) {
    const existing = await findAnyUserByEmail(def.email);
    if (existing) {
      skippedCount++;
      continue;
    }

    const userId = await createBaseUser(def);

    if (def.kind === "HYBRID") {
      // Pelo repositório, não pelo service: o service pede um ator para o guard
      // de não-escalação (8.3), e aqui não há request nenhuma — o seed é
      // infraestrutura. Mesmo corte que já se faz com `userRepository.create*`
      // para não disparar email de verificação.
      const roles = await getRolesByNames(def.employeeRoleNames);

      await userProfileRepository.createEmployeeProfile(
        userId,
        roles.map((role) => role.id),
      );
    }

    await applyTrait(userId, def.trait);
    createdCount++;
  }

  return { createdCount, skippedCount };
}

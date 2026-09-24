import { buildCustomer } from "@tests/factories/user.factory";
import { fixtureAudit } from "@tests/helpers/audit";
import { clearDatabase } from "@tests/helpers/database";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { generateOpaqueToken, hashToken } from "@/lib/token";
import { invalidateSessionsOfUser } from "@/modules/auth/auth.liveSession.repository";
import {
  findLiveSessionsByUserId,
  updatePasswordAndInvalidateSessions,
} from "@/modules/auth/auth.repository";
import { mintVerificationToken } from "@/modules/auth/verificationToken.service";
import {
  banUserAndInvalidateSessions,
  forcePasswordResetAndInvalidateSessions,
  softDeleteUserAndInvalidateSessions,
} from "@/modules/user/user.repository";

// O filtro e a invalidação de sessão são dirigidos direto aqui, sem passar por
// HTTP: os fluxos de ban, reset, troca de senha e deleção já os cobrem por
// fora, e é justamente por isso que uma divergência entre os dois nunca
// aparecia em teste nenhum — todo caminho benigno concorda.

const HOUR_MS = 60 * 60 * 1000;

afterEach(async () => {
  await clearDatabase();
});

type SessionState = {
  expiresAt?: Date;
  usedAt?: Date | null;
  invalidatedAt?: Date | null;
};

async function createSession(userId: string, state: SessionState = {}) {
  return prisma.session.create({
    data: {
      userId,
      refreshTokenHash: hashToken(generateOpaqueToken()),
      expiresAt: state.expiresAt ?? new Date(Date.now() + HOUR_MS),
      usedAt: state.usedAt ?? null,
      invalidatedAt: state.invalidatedAt ?? null,
    },
  });
}

describe("o filtro de sessão viva contra o banco", () => {
  it("lista a sessão viva e nenhuma das três que não são", async () => {
    const user = await buildCustomer();
    const live = await createSession(user.id);
    await createSession(user.id, { usedAt: new Date() });
    await createSession(user.id, { invalidatedAt: new Date() });
    await createSession(user.id, {
      expiresAt: new Date(Date.now() - HOUR_MS),
    });

    const listed = await findLiveSessionsByUserId(user.id);

    expect(listed.map((session) => session.id)).toEqual([live.id]);
  });

  it("não enxerga a sessão viva de outro usuário", async () => {
    const owner = await buildCustomer();
    const stranger = await buildCustomer();
    await createSession(stranger.id);

    expect(await findLiveSessionsByUserId(owner.id)).toEqual([]);
  });
});

describe("derrubar as sessões de um usuário", () => {
  it("mata a sessão viva e também o elo já rotacionado, que é o que fecha a porta da janela de graça", async () => {
    const user = await buildCustomer();
    const live = await createSession(user.id);
    const rotated = await createSession(user.id, { usedAt: new Date() });
    const killedAt = new Date();

    const { count } = await invalidateSessionsOfUser(prisma, user.id, killedAt);

    expect(count).toBe(2);
    const rows = await prisma.session.findMany({
      where: { id: { in: [live.id, rotated.id] } },
    });
    for (const row of rows) {
      expect(row.invalidatedAt).toEqual(killedAt);
    }
    expect(await findLiveSessionsByUserId(user.id)).toEqual([]);
  });

  it("não remarca a sessão que já estava invalidada — a primeira morte é a que vale", async () => {
    const user = await buildCustomer();
    const firstDeath = new Date(Date.now() - HOUR_MS);
    const already = await createSession(user.id, {
      invalidatedAt: firstDeath,
    });

    const { count } = await invalidateSessionsOfUser(
      prisma,
      user.id,
      new Date(),
    );

    expect(count).toBe(0);
    const row = await prisma.session.findUniqueOrThrow({
      where: { id: already.id },
    });
    expect(row.invalidatedAt).toEqual(firstDeath);
  });

  it("deixa a sessão já expirada em paz: ela não é alcançável, e marcá-la não mudaria nada", async () => {
    const user = await buildCustomer();
    const expired = await createSession(user.id, {
      expiresAt: new Date(Date.now() - HOUR_MS),
    });

    const { count } = await invalidateSessionsOfUser(
      prisma,
      user.id,
      new Date(),
    );

    expect(count).toBe(0);
    const row = await prisma.session.findUniqueOrThrow({
      where: { id: expired.id },
    });
    expect(row.invalidatedAt).toBeNull();
  });

  it("não encosta na sessão de outro usuário", async () => {
    const user = await buildCustomer();
    const stranger = await buildCustomer();
    await createSession(user.id);
    const untouched = await createSession(stranger.id);

    await invalidateSessionsOfUser(prisma, user.id, new Date());

    const row = await prisma.session.findUniqueOrThrow({
      where: { id: untouched.id },
    });
    expect(row.invalidatedAt).toBeNull();
    expect(await findLiveSessionsByUserId(stranger.id)).toHaveLength(1);
  });

  it("é a mesma operação em todo site de escrita: nenhum deixa o elo rotacionado de pé", async () => {
    const sites: Array<[string, (userId: string) => Promise<unknown>]> = [
      [
        "ban",
        (id) =>
          banUserAndInvalidateSessions(
            id,
            "admin-1",
            "fraude",
            fixtureAudit({
              action: "USER_BANNED",
              targetType: "User",
              targetId: id,
              metadata: { reasonProvided: true },
            }),
          ),
      ],
      [
        "deleção",
        (id) =>
          softDeleteUserAndInvalidateSessions(id, (counts) =>
            fixtureAudit({
              action: "USER_DELETED",
              targetType: "User",
              targetId: id,
              metadata: {
                cascadedProfiles: counts.profiles,
                cascadedRoles: counts.roles,
                cascadedOverrides: counts.overrides,
                cascadedPets: counts.pets,
              },
            }),
          ),
      ],
      [
        "reset forçado",
        (id) =>
          forcePasswordResetAndInvalidateSessions(
            id,
            mintVerificationToken("PASSWORD_RESET").stored,
            fixtureAudit({
              action: "PASSWORD_CHANGE_FORCED",
              targetType: "User",
              targetId: id,
            }),
          ),
      ],
      [
        "troca de senha",
        (id) =>
          updatePasswordAndInvalidateSessions(
            id,
            "hash-novo",
            fixtureAudit({
              action: "PASSWORD_CHANGED",
              targetType: "User",
              targetId: id,
            }),
          ),
      ],
    ];

    for (const [site, run] of sites) {
      const user = await buildCustomer();
      const live = await createSession(user.id);
      const rotated = await createSession(user.id, { usedAt: new Date() });

      await run(user.id);

      const rows = await prisma.session.findMany({
        where: { id: { in: [live.id, rotated.id] } },
      });
      for (const row of rows) {
        expect(
          row.invalidatedAt,
          `${site} deixou uma sessão de pé`,
        ).not.toBeNull();
      }
      await clearDatabase();
    }
  });

  it("roda dentro de uma transação e desfaz junto com ela", async () => {
    const user = await buildCustomer();
    const live = await createSession(user.id);

    await expect(
      prisma.$transaction(async (tx) => {
        await invalidateSessionsOfUser(tx, user.id, new Date());
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");

    const row = await prisma.session.findUniqueOrThrow({
      where: { id: live.id },
    });
    expect(row.invalidatedAt).toBeNull();
  });
});

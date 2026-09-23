import { buildCustomer } from "@tests/factories/user.factory";
import { clearDatabase } from "@tests/helpers/database";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/token";
import {
  consumeToken,
  findVerificationTokenByHash,
  type VerificationTokenRow,
} from "@/modules/auth/verificationToken.repository";
import {
  consumeVerificationToken,
  issueVerificationToken,
} from "@/modules/auth/verificationToken.service";

// A emissão e o consumo são dirigidos direto aqui, sem HTTP: os quatro fluxos
// de purpose já os cobrem por fora, mas o que prende o efeito à marca de uso é
// a transação — e uma transação só se prova quando algo dentro dela falha.

afterEach(async () => {
  await clearDatabase();
});

const tokenOf = (rawToken: string) =>
  findVerificationTokenByHash(hashToken(rawToken));

describe("a emissão de um token de verificação", () => {
  it("guarda o hash, nunca o valor que vai no email", async () => {
    const user = await buildCustomer();

    const rawToken = await issueVerificationToken({
      userId: user.id,
      purpose: "EMAIL_VERIFICATION",
    });

    const rows = await prisma.verificationToken.findMany();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).toBe(hashToken(rawToken));
    expect(rows.map((row) => row.tokenHash)).not.toContain(rawToken);
  });

  it("congela no token a escolha do ator e o alvo da troca", async () => {
    const user = await buildCustomer();

    const change = await issueVerificationToken({
      userId: user.id,
      purpose: "EMAIL_CHANGE",
      newEmail: "novo@exemplo.com",
    });
    const reactivation = await issueVerificationToken({
      userId: user.id,
      purpose: "ACCOUNT_REACTIVATION",
      restore: { profiles: ["CUSTOMER"], roleIds: ["role-1"] },
    });

    expect(await tokenOf(change)).toMatchObject({
      newEmail: "novo@exemplo.com",
    });
    expect(await tokenOf(reactivation)).toMatchObject({
      restoreProfiles: ["CUSTOMER"],
      restoreRoleIds: ["role-1"],
    });
  });

  it("queima o pendente do mesmo purpose, e só ele", async () => {
    const user = await buildCustomer();
    const stranger = await buildCustomer();

    const superseded = await issueVerificationToken({
      userId: user.id,
      purpose: "EMAIL_CHANGE",
      newEmail: "primeiro@exemplo.com",
    });
    const otherPurpose = await issueVerificationToken({
      userId: user.id,
      purpose: "PASSWORD_RESET",
    });
    const otherUser = await issueVerificationToken({
      userId: stranger.id,
      purpose: "EMAIL_CHANGE",
      newEmail: "terceiro@exemplo.com",
    });

    const current = await issueVerificationToken({
      userId: user.id,
      purpose: "EMAIL_CHANGE",
      supersedePending: true,
      newEmail: "segundo@exemplo.com",
    });

    expect((await tokenOf(superseded))?.usedAt).not.toBeNull();
    expect((await tokenOf(current))?.usedAt).toBeNull();
    expect((await tokenOf(otherPurpose))?.usedAt).toBeNull();
    expect((await tokenOf(otherUser))?.usedAt).toBeNull();
  });

  it("desfaz o token junto com o efeito que a emissão carrega", async () => {
    const user = await buildCustomer();

    await expect(
      issueVerificationToken({
        userId: user.id,
        purpose: "EMAIL_CHANGE",
        newEmail: "novo@exemplo.com",
        effect: async () => {
          throw new Error("o efeito da emissão falhou");
        },
      }),
    ).rejects.toThrow("o efeito da emissão falhou");

    expect(await prisma.verificationToken.count()).toBe(0);
  });
});

describe("o consumo de um token de verificação contra o banco", () => {
  async function issueFor(userId: string) {
    const rawToken = await issueVerificationToken({
      userId,
      purpose: "EMAIL_VERIFICATION",
    });

    return {
      rawToken,
      token: (await tokenOf(rawToken)) as VerificationTokenRow,
    };
  }

  it("marca o uso e roda o efeito do purpose", async () => {
    const user = await buildCustomer();
    const { rawToken } = await issueFor(user.id);

    const consumed = await consumeVerificationToken({
      rawToken,
      purpose: "EMAIL_VERIFICATION",
      invalidTokenError: { message: "inválido", action: "peça outro" },
      plan: async () => ({
        effect: (tx, token) =>
          tx.user.update({
            where: { id: token.userId },
            data: { pendingEmail: "efeito@exemplo.com" },
          }),
      }),
    });

    expect(consumed.userId).toBe(user.id);
    expect((await tokenOf(rawToken))?.usedAt).not.toBeNull();
    expect(
      (await prisma.user.findUnique({ where: { id: user.id } }))?.pendingEmail,
    ).toBe("efeito@exemplo.com");
  });

  it("entrega ao efeito o token que autorizou a ação", async () => {
    const user = await buildCustomer();
    const { rawToken, token } = await issueFor(user.id);

    const seen = await consumeVerificationToken({
      rawToken,
      purpose: "EMAIL_VERIFICATION",
      invalidTokenError: { message: "inválido", action: "peça outro" },
      plan: async () => ({ effect: async (_tx, given) => given.id }),
    });

    expect(seen.id).toBe(token.id);
  });

  it("não deixa o token queimado — nem rastro — quando o efeito falha", async () => {
    const user = await buildCustomer();
    const { rawToken } = await issueFor(user.id);

    await expect(
      consumeVerificationToken({
        rawToken,
        purpose: "EMAIL_VERIFICATION",
        invalidTokenError: { message: "inválido", action: "peça outro" },
        plan: async () => ({
          effect: async (tx, token) => {
            await tx.user.update({
              where: { id: token.userId },
              data: { pendingEmail: "efeito@exemplo.com" },
            });
            throw new Error("o efeito do purpose falhou");
          },
          audit: {
            action: "EMAIL_CHANGE_COMPLETED" as const,
            targetType: "User" as const,
            targetId: user.id,
          },
        }),
      }),
    ).rejects.toThrow("o efeito do purpose falhou");

    // A credencial é de uso único: marcá-la sem a ação ter acontecido deixaria
    // o usuário sem nada a apresentar de novo. Marca, efeito e trilha caem
    // juntos porque são a mesma transação.
    expect((await tokenOf(rawToken))?.usedAt).toBeNull();
    expect(
      (await prisma.user.findUnique({ where: { id: user.id } }))?.pendingEmail,
    ).toBeNull();
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it("recusa o token já usado — e a recusa é a mesma do desconhecido", async () => {
    const user = await buildCustomer();
    const { rawToken } = await issueFor(user.id);

    const consume = () =>
      consumeVerificationToken({
        rawToken,
        purpose: "EMAIL_VERIFICATION",
        invalidTokenError: { message: "inválido", action: "peça outro" },
        plan: async () => ({ effect: async () => undefined }),
      });

    await consume();

    await expect(consume()).rejects.toMatchObject({
      statusCode: 400,
      message: "inválido",
    });
  });

  it("grava a linha de auditoria na mesma transação, do que o efeito devolveu", async () => {
    const user = await buildCustomer();
    const { token } = await issueFor(user.id);

    await consumeToken(
      token,
      async () => ({ restoredPets: 3 }),
      (counts) => ({
        action: "ACCOUNT_REACTIVATION_COMPLETED",
        targetType: "User",
        targetId: user.id,
        metadata: { ...counts },
      }),
    );

    expect(
      await prisma.auditLog.findMany({
        where: { action: "ACCOUNT_REACTIVATION_COMPLETED" },
      }),
    ).toMatchObject([{ targetId: user.id, metadata: { restoredPets: 3 } }]);
  });
});

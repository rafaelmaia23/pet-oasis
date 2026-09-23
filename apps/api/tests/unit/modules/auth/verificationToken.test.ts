import { beforeEach, describe, expect, it, vi } from "vitest";
import { BadRequestError } from "@/errors";
import type { VerificationPurpose } from "@/generated/prisma/enums";
import { hashToken } from "@/lib/token";
import {
  consumeToken,
  findVerificationTokenByHash,
  isUsableVerificationToken,
  type VerificationTokenRow,
} from "@/modules/auth/verificationToken.repository";
import {
  consumeVerificationToken,
  mintVerificationToken,
  VERIFICATION_TOKEN_TTL_MS,
} from "@/modules/auth/verificationToken.service";

// Só as duas operações que falam com o banco são falsas; o predicado de
// validade é puro e fica real, senão o teste provaria o dublê.
vi.mock(
  "@/modules/auth/verificationToken.repository",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/modules/auth/verificationToken.repository")
      >();

    return {
      ...actual,
      findVerificationTokenByHash: vi.fn(),
      consumeToken: vi.fn(),
    };
  },
);

const mockedFind = vi.mocked(findVerificationTokenByHash);
const mockedConsume = vi.mocked(consumeToken);

// O predicado puro é exercitado contra um instante fixo; o consumo, que lê o
// relógio de verdade, contra um prazo relativo a agora.
const NOW = new Date("2026-09-23T12:00:00.000Z");
const LATER = new Date(NOW.getTime() + 60_000);
const EARLIER = new Date(NOW.getTime() - 60_000);

const stillValid = () => new Date(Date.now() + 60_000);
const alreadyExpired = () => new Date(Date.now() - 60_000);

const INVALID = {
  message: "Token de verificação inválido ou expirado",
  action: "Solicite um novo email de verificação",
};

function makeToken(
  overrides: Partial<VerificationTokenRow> = {},
): VerificationTokenRow {
  return {
    id: "token-1",
    userId: "user-1",
    tokenHash: "hash",
    purpose: "EMAIL_VERIFICATION",
    expiresAt: stillValid(),
    usedAt: null,
    newEmail: null,
    restoreProfiles: [],
    restoreRoleIds: [],
    createdAt: EARLIER,
    ...overrides,
  };
}

/** O consumo de um token de email verification, com um plano que só marca que rodou. */
function consumeWith(
  plan = vi.fn(async () => ({ effect: async () => undefined })),
  purpose: VerificationPurpose = "EMAIL_VERIFICATION",
) {
  return {
    plan,
    promise: consumeVerificationToken({
      rawToken: "cru",
      purpose,
      invalidTokenError: INVALID,
      plan,
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("a validade de um token de verificação", () => {
  it("aceita o token do purpose pedido, não usado e não expirado", () => {
    expect(
      isUsableVerificationToken(
        makeToken({ expiresAt: LATER }),
        "EMAIL_VERIFICATION",
        NOW,
      ),
    ).toBe(true);
  });

  it("recusa o token de outro purpose", () => {
    expect(
      isUsableVerificationToken(
        makeToken({ purpose: "PASSWORD_RESET", expiresAt: LATER }),
        "EMAIL_VERIFICATION",
        NOW,
      ),
    ).toBe(false);
  });

  it("recusa o token já usado", () => {
    expect(
      isUsableVerificationToken(
        makeToken({ usedAt: EARLIER, expiresAt: LATER }),
        "EMAIL_VERIFICATION",
        NOW,
      ),
    ).toBe(false);
  });

  it("recusa o token expirado", () => {
    expect(
      isUsableVerificationToken(
        makeToken({ expiresAt: EARLIER }),
        "EMAIL_VERIFICATION",
        NOW,
      ),
    ).toBe(false);
  });

  it("recusa o token que expira exatamente agora — a fronteira é `gt`, como no banco", () => {
    expect(
      isUsableVerificationToken(
        makeToken({ expiresAt: NOW }),
        "EMAIL_VERIFICATION",
        NOW,
      ),
    ).toBe(false);
  });

  it("recusa o token que não existe", () => {
    expect(isUsableVerificationToken(null, "EMAIL_VERIFICATION", NOW)).toBe(
      false,
    );
  });
});

describe("o consumo de um token de verificação", () => {
  it.each([
    ["desconhecido", null],
    ["já usado", makeToken({ usedAt: EARLIER })],
    ["expirado", makeToken({ expiresAt: alreadyExpired() })],
    ["de purpose errado", makeToken({ purpose: "PASSWORD_RESET" })],
  ])("recusa o token %s com o 400 genérico do purpose", async (_, row) => {
    mockedFind.mockResolvedValue(row);

    const { plan, promise } = consumeWith();

    await expect(promise).rejects.toMatchObject({
      statusCode: 400,
      message: INVALID.message,
      action: INVALID.action,
    });
    await expect(promise.catch((e) => e)).resolves.toBeInstanceOf(
      BadRequestError,
    );

    // A recusa não pode custar nada nem deixar rastro: nem o trabalho do
    // purpose, nem a marca de uso.
    expect(plan).not.toHaveBeenCalled();
    expect(mockedConsume).not.toHaveBeenCalled();
  });

  it("nada no corpo do 400 distingue os quatro motivos (ADR-0071)", async () => {
    const bodies = [];

    for (const row of [
      null,
      makeToken({ usedAt: EARLIER }),
      makeToken({ expiresAt: alreadyExpired() }),
      makeToken({ purpose: "PASSWORD_RESET" }),
    ]) {
      mockedFind.mockResolvedValue(row);
      const error = await consumeWith().promise.catch((e) => e);
      bodies.push(JSON.stringify(error.toJson()));
    }

    expect(new Set(bodies).size).toBe(1);
  });

  it("procura o token pelo hash, nunca pelo valor cru", async () => {
    mockedFind.mockResolvedValue(null);

    await consumeWith().promise.catch(() => {});

    expect(mockedFind).toHaveBeenCalledWith(hashToken("cru"));
  });

  it("entrega ao repositório o token, o efeito do purpose e o audit", async () => {
    const token = makeToken();
    const effect = vi.fn(async () => "resultado");
    const audit = {
      action: "PASSWORD_RESET_COMPLETED",
      targetType: "User",
      targetId: "user-1",
    } as const;

    mockedFind.mockResolvedValue(token);
    mockedConsume.mockResolvedValue("resultado");

    const plan = vi.fn(async () => ({ effect, audit }));
    const consumed = await consumeVerificationToken({
      rawToken: "cru",
      purpose: "EMAIL_VERIFICATION",
      invalidTokenError: INVALID,
      plan,
    });

    expect(plan).toHaveBeenCalledWith(token);
    expect(mockedConsume).toHaveBeenCalledWith(token, effect, audit);
    // O token consumido volta para quem chamou: é dele que o service tira o
    // dono da ação e a escolha que o token carregava.
    expect(consumed).toBe(token);
  });

  it("monta o plano depois de validar — o trabalho caro nunca roda por um token ruim", async () => {
    const order: string[] = [];

    mockedFind.mockImplementation(async () => {
      order.push("find");
      return makeToken();
    });
    mockedConsume.mockImplementation(async () => {
      order.push("consume");
      return undefined;
    });

    await consumeVerificationToken({
      rawToken: "cru",
      purpose: "EMAIL_VERIFICATION",
      invalidTokenError: INVALID,
      plan: async () => {
        order.push("plan");
        return { effect: async () => undefined };
      },
    });

    expect(order).toEqual(["find", "plan", "consume"]);
  });

  it("aceita uma cláusula extra de validade do purpose, e a recusa é o mesmo 400", async () => {
    mockedFind.mockResolvedValue(makeToken({ newEmail: null }));

    const plan = vi.fn(async () => ({ effect: async () => undefined }));

    await expect(
      consumeVerificationToken({
        rawToken: "cru",
        purpose: "EMAIL_VERIFICATION",
        invalidTokenError: INVALID,
        alsoUsable: (token) => token.newEmail !== null,
        plan,
      }),
    ).rejects.toMatchObject({ statusCode: 400, message: INVALID.message });

    expect(plan).not.toHaveBeenCalled();
    expect(mockedConsume).not.toHaveBeenCalled();
  });
});

describe("a emissão de um token de verificação", () => {
  it("tem um TTL por purpose, e um purpose novo sem TTL não compila", () => {
    const purposes: VerificationPurpose[] = [
      "EMAIL_VERIFICATION",
      "PASSWORD_RESET",
      "EMAIL_CHANGE",
      "ACCOUNT_REACTIVATION",
    ];

    expect(Object.keys(VERIFICATION_TOKEN_TTL_MS).sort()).toEqual(
      [...purposes].sort(),
    );
    for (const purpose of purposes) {
      expect(VERIFICATION_TOKEN_TTL_MS[purpose]).toBeGreaterThan(0);
    }
  });

  it("guarda o hash e entrega o cru — o que vai para o banco nunca é a credencial", () => {
    const minted = mintVerificationToken("PASSWORD_RESET");

    expect(minted.stored.tokenHash).toBe(hashToken(minted.rawToken));
    expect(JSON.stringify(minted.stored)).not.toContain(minted.rawToken);
  });

  it("expira o token no TTL do purpose", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    const minted = mintVerificationToken("PASSWORD_RESET");

    expect(minted.stored.purpose).toBe("PASSWORD_RESET");
    expect(minted.stored.expiresAt).toEqual(
      new Date(NOW.getTime() + VERIFICATION_TOKEN_TTL_MS.PASSWORD_RESET),
    );
  });
});

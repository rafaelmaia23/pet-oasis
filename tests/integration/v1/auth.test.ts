import { buildCustomer, makeCustomerData } from "@tests/factories/user.factory";
import {
  expectValidationError,
  expectValidUuid,
} from "@tests/helpers/assertions";
import {
  extractRefreshCookie,
  loginAs,
  loginWithSession,
} from "@tests/helpers/auth";
import { clearDatabase } from "@tests/helpers/database";
import { flushRedis } from "@tests/helpers/redis";
import request from "supertest";
import {
  afterEach,
  assert,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { z } from "zod";
import app from "@/app";
import { env } from "@/config/env";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { generateOpaqueToken, hashToken } from "@/lib/token";
import {
  REFRESH_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_PATH,
} from "@/modules/auth/auth.constants";
import { sessionViews } from "@/modules/auth/auth.presenter";
import { userViews } from "@/modules/user/user.presenter";
import { findUserById } from "@/modules/user/user.repository";

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock("@/lib/email", () => ({ send: sendMock }));

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockResolvedValue(undefined);
});

/** Extracts the raw token from the `?token=` link in the last sent email. */
function tokenFromLastEmail(): string {
  const call = sendMock.mock.calls.at(-1)?.[0] as { html: string } | undefined;
  const match = call?.html.match(/token=([a-f0-9]+)/);
  if (!match?.[1]) {
    throw new Error("verification token not found in the sent email");
  }
  return match[1];
}

/** Persists a verification token for a user, returning the raw (unhashed) token. */
async function seedVerificationToken(
  userId: string,
  overrides?: {
    purpose?: "EMAIL_VERIFICATION" | "PASSWORD_RESET" | "EMAIL_CHANGE";
    expiresAt?: Date;
    usedAt?: Date | null;
    newEmail?: string;
  },
): Promise<string> {
  const rawToken = generateOpaqueToken();
  await prisma.verificationToken.create({
    data: {
      userId,
      tokenHash: hashToken(rawToken),
      purpose: overrides?.purpose ?? "EMAIL_VERIFICATION",
      expiresAt: overrides?.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
      usedAt: overrides?.usedAt ?? null,
      newEmail: overrides?.newEmail ?? null,
    },
  });
  return rawToken;
}

function rawRefreshTokenFromCookie(refreshCookie: string): string {
  return refreshCookie.split("=")[1] as string;
}

async function sessionIdFromCookie(refreshCookie: string): Promise<string> {
  const session = await prisma.session.findUniqueOrThrow({
    where: {
      refreshTokenHash: hashToken(rawRefreshTokenFromCookie(refreshCookie)),
    },
  });
  return session.id;
}

afterEach(async () => {
  await clearDatabase();
  await flushRedis();
});

describe("POST /api/v1/auth/signup", () => {
  it("should return 201 and create a new user for valid data", async () => {
    const data = makeCustomerData();

    const response = await request(app).post("/api/v1/auth/signup").send(data);

    expect(response.status).toBe(201);

    expect(response.body).not.toHaveProperty("passwordHash");

    expect(response.body).toMatchObject({
      name: data.name,
      email: data.email,
    });

    expect(response.body).toMatchView(userViews.owner);

    expect(response.body.id).toBeDefined();
    expectValidUuid(response.body.id);

    const userInDb = await findUserById(response.body.id);

    assert(userInDb !== null, "User should be found in the database");

    expect(await verifyPassword(data.password, userInDb.passwordHash)).toBe(
      true,
    );
    expect(await verifyPassword("wrong-password", userInDb.passwordHash)).toBe(
      false,
    );
  });

  it("should create the user as PENDING and emit an email verification token", async () => {
    const data = makeCustomerData();

    const response = await request(app).post("/api/v1/auth/signup").send(data);

    expect(response.status).toBe(201);

    const userInDb = await findUserById(response.body.id);
    assert(userInDb !== null, "User should be found in the database");
    expect(userInDb.status).toBe("PENDING");

    const tokens = await prisma.verificationToken.findMany({
      where: { userId: userInDb.id },
    });
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.purpose).toBe("EMAIL_VERIFICATION");
    expect(tokens[0]?.usedAt).toBeNull();

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: data.email }),
    );
  });

  it("should return 409 if email is already in use", async () => {
    const data = makeCustomerData();

    await request(app).post("/api/v1/auth/signup").send(data);
    const response = await request(app).post("/api/v1/auth/signup").send(data);

    expect(response.status).toBe(409);

    expect(response.body).toMatchObject({
      message: "O email informado já está em uso",
      action: "Tente outro valor para o campo email",
      code: "CONFLICT",
    });
  });

  it("should return the same generic 409 when the email belongs to a banned user", async () => {
    const banned = await buildCustomer();
    await prisma.user.update({
      where: { id: banned.id },
      data: { bannedAt: new Date(), banReason: "abuse" },
    });

    const response = await request(app)
      .post("/api/v1/auth/signup")
      .send(makeCustomerData({ email: banned.email }));

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      message: "O email informado já está em uso",
      code: "CONFLICT",
    });
  });

  it("should return the same generic 409 when the email was previously used by another account", async () => {
    const other = await buildCustomer();
    const reservedEmail = other.email;
    await prisma.user.update({
      where: { id: other.id },
      data: { email: `changed-${other.id}@example.com` },
    });
    await prisma.previousEmail.create({
      data: { userId: other.id, email: reservedEmail, replacedAt: new Date() },
    });

    const response = await request(app)
      .post("/api/v1/auth/signup")
      .send(makeCustomerData({ email: reservedEmail }));

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      message: "O email informado já está em uso",
      code: "CONFLICT",
    });
  });

  it("should return 422 if name is missing", async () => {
    const data = makeCustomerData({ name: "" });

    const response = await request(app).post("/api/v1/auth/signup").send(data);

    expect(response.status).toBe(422);

    expectValidationError(response, ["name"]);
  });

  it("should return 422 if email is invalid", async () => {
    const data = makeCustomerData({ email: "invalid-email" });

    const response = await request(app).post("/api/v1/auth/signup").send(data);

    expect(response.status).toBe(422);

    expectValidationError(response, ["email"]);
  });

  it("should return 422 if password does not meet requirements", async () => {
    const data = makeCustomerData({ password: "weak" });

    const response = await request(app).post("/api/v1/auth/signup").send(data);

    expect(response.status).toBe(422);

    expectValidationError(response, ["password"]);
  });
});

describe("POST /api/v1/auth/login", () => {
  it("should return 200 with only the access token in the body", async () => {
    const user = await buildCustomer();

    const response = await request(app).post("/api/v1/auth/login").send({
      email: user.email,
      password: user.password,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ accessToken: expect.any(String) });
  });

  it("should set the refresh token as an httpOnly, non-secure cookie scoped to /api/v1/auth", async () => {
    const user = await buildCustomer();

    const response = await request(app).post("/api/v1/auth/login").send({
      email: user.email,
      password: user.password,
    });

    const setCookieHeader = response.headers["set-cookie"] as unknown as
      | string[]
      | undefined;

    expect(setCookieHeader).toBeDefined();

    const refreshCookie = setCookieHeader?.find((cookie) =>
      cookie.startsWith(`${REFRESH_TOKEN_COOKIE_NAME}=`),
    );

    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toContain("HttpOnly");
    expect(refreshCookie).toContain("SameSite=Lax");
    expect(refreshCookie).toContain(`Path=${REFRESH_TOKEN_COOKIE_PATH}`);
    expect(refreshCookie).not.toContain("Secure");
  });

  it("should return 401 for invalid password", async () => {
    const user = await buildCustomer();

    const response = await request(app).post("/api/v1/auth/login").send({
      email: user.email,
      password: "wrongpassword",
    });

    expect(response.status).toBe(401);
  });

  it("should return 403 when the account is not verified (PENDING)", async () => {
    const user = await buildCustomer({ status: "PENDING" });

    const response = await request(app).post("/api/v1/auth/login").send({
      email: user.email,
      password: user.password,
    });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("FORBIDDEN");
  });

  it("should return 403 when the account is banned", async () => {
    const user = await buildCustomer();
    await prisma.user.update({
      where: { id: user.id },
      data: { bannedAt: new Date(), banReason: "abuse" },
    });

    const response = await request(app).post("/api/v1/auth/login").send({
      email: user.email,
      password: user.password,
    });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("FORBIDDEN");
  });

  it("should return 401 for non-existing email", async () => {
    const response = await request(app).post("/api/v1/auth/login").send({
      email: "nonexisting@test.com",
      password: "Test@1234",
    });

    expect(response.status).toBe(401);
  });

  it("should return 422 if email is not a valid email address", async () => {
    const response = await request(app).post("/api/v1/auth/login").send({
      email: "not-an-email",
      password: "Test@1234",
    });

    expect(response.status).toBe(422);

    expectValidationError(response, ["email"]);
  });

  it("should return 422 if password is missing", async () => {
    const user = await buildCustomer();

    const response = await request(app).post("/api/v1/auth/login").send({
      email: user.email,
      password: "",
    });

    expect(response.status).toBe(422);

    expectValidationError(response, ["password"]);
  });

  it("should create a new independent session on every login (no token-reuse quirk)", async () => {
    const user = await buildCustomer();

    await request(app).post("/api/v1/auth/login").send({
      email: user.email,
      password: user.password,
    });
    await request(app).post("/api/v1/auth/login").send({
      email: user.email,
      password: user.password,
    });

    const sessions = await prisma.session.findMany({
      where: { userId: user.id },
    });

    expect(sessions).toHaveLength(2);
    expect(sessions[0]?.refreshTokenHash).not.toBe(
      sessions[1]?.refreshTokenHash,
    );
  });
});

describe("POST /api/v1/auth/refresh", () => {
  it("should return 401 if no refresh cookie is sent", async () => {
    const response = await request(app).post("/api/v1/auth/refresh");

    expect(response.status).toBe(401);
  });

  it("should return 401 if the refresh token hash is not found", async () => {
    const response = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", `${REFRESH_TOKEN_COOKIE_NAME}=nonexistent-token-value`);

    expect(response.status).toBe(401);
  });

  it("should return 401 if the session has been invalidated", async () => {
    const user = await buildCustomer();
    const { refreshCookie } = await loginWithSession(user.email, user.password);

    await prisma.session.updateMany({
      where: { userId: user.id },
      data: { invalidatedAt: new Date() },
    });

    const response = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", refreshCookie);

    expect(response.status).toBe(401);
  });

  it("should return 401 if the session has expired", async () => {
    const user = await buildCustomer();
    const { refreshCookie } = await loginWithSession(user.email, user.password);

    await prisma.session.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", refreshCookie);

    expect(response.status).toBe(401);
  });

  it("should invalidate ALL of the user's sessions when a used refresh token is replayed (theft detection)", async () => {
    const user = await buildCustomer();

    const { refreshCookie: refreshCookieA } = await loginWithSession(
      user.email,
      user.password,
    );
    await loginWithSession(user.email, user.password); // sessão B, dispositivo independente

    const rotateResponse = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", refreshCookieA);

    expect(rotateResponse.status).toBe(200);

    const replayResponse = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", refreshCookieA);

    expect(replayResponse.status).toBe(401);

    const sessions = await prisma.session.findMany({
      where: { userId: user.id },
    });

    expect(sessions.length).toBeGreaterThanOrEqual(3);
    for (const session of sessions) {
      expect(session.invalidatedAt).not.toBeNull();
    }
  });

  it("should rotate the refresh token and issue a new access token that works on a protected route", async () => {
    const user = await buildCustomer();
    const { refreshCookie } = await loginWithSession(user.email, user.password);

    const response = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", refreshCookie);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ accessToken: expect.any(String) });

    const newRefreshCookie = extractRefreshCookie(response);
    expect(newRefreshCookie).not.toBe(refreshCookie);

    const meResponse = await request(app)
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${response.body.accessToken}`);

    expect(meResponse.status).toBe(200);
  });
});

describe("POST /api/v1/auth/logout", () => {
  it("should return 401 if no access token is provided", async () => {
    const response = await request(app).post("/api/v1/auth/logout");

    expect(response.status).toBe(401);
  });

  it("should return 403 if user does not have the manage:session feature", async () => {
    const user = await buildCustomer({ denies: ["manage:session"] });
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it("should return 401 if no refresh cookie is sent", async () => {
    const user = await buildCustomer();
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
  });

  it("should return 404 if the refresh token hash is not found", async () => {
    const user = await buildCustomer();
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${token}`)
      .set("Cookie", `${REFRESH_TOKEN_COOKIE_NAME}=nonexistent-token-value`);

    expect(response.status).toBe(404);
  });

  it("should return 404 if the session belongs to another user", async () => {
    const userA = await buildCustomer();
    const { refreshCookie: refreshCookieA } = await loginWithSession(
      userA.email,
      userA.password,
    );

    const userB = await buildCustomer();
    const tokenB = await loginAs(userB.email, userB.password);

    const response = await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${tokenB}`)
      .set("Cookie", refreshCookieA);

    expect(response.status).toBe(404);
  });

  it("should invalidate the session and clear the refresh cookie", async () => {
    const user = await buildCustomer();
    const { accessToken, refreshCookie } = await loginWithSession(
      user.email,
      user.password,
    );

    const response = await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Cookie", refreshCookie);

    expect(response.status).toBe(204);

    const setCookieHeader = response.headers["set-cookie"] as unknown as
      | string[]
      | undefined;
    const clearedCookie = setCookieHeader?.find((cookie) =>
      cookie.startsWith(`${REFRESH_TOKEN_COOKIE_NAME}=`),
    );

    expect(clearedCookie).toBeDefined();
    expect(clearedCookie).toMatch(/Expires=Thu, 01 Jan 1970/);

    const sessions = await prisma.session.findMany({
      where: { userId: user.id },
    });
    expect(sessions[0]?.invalidatedAt).not.toBeNull();
  });

  it("should be idempotent when logging out twice", async () => {
    const user = await buildCustomer();
    const { accessToken, refreshCookie } = await loginWithSession(
      user.email,
      user.password,
    );

    const first = await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Cookie", refreshCookie);

    expect(first.status).toBe(204);

    const second = await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Cookie", refreshCookie);

    expect(second.status).toBe(204);
  });

  it("should not affect other sessions of the same user", async () => {
    const user = await buildCustomer();
    const { accessToken, refreshCookie: refreshCookieA } =
      await loginWithSession(user.email, user.password);
    await loginWithSession(user.email, user.password); // sessão B, dispositivo independente

    await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Cookie", refreshCookieA);

    const sessions = await prisma.session.findMany({
      where: { userId: user.id },
    });

    expect(sessions).toHaveLength(2);
    const invalidatedCount = sessions.filter(
      (s) => s.invalidatedAt !== null,
    ).length;
    expect(invalidatedCount).toBe(1);
  });

  it("should keep the access token usable on a protected route right after logout (JWT is stateless)", async () => {
    const user = await buildCustomer();
    const { accessToken, refreshCookie } = await loginWithSession(
      user.email,
      user.password,
    );

    await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Cookie", refreshCookie);

    const response = await request(app)
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
  });
});

describe("session cap (MAX_LIVE_SESSIONS)", () => {
  it("should never refuse a login even after exceeding the live session cap", async () => {
    const user = await buildCustomer();

    for (let i = 0; i < env.MAX_LIVE_SESSIONS + 1; i++) {
      const response = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: user.email, password: user.password });

      expect(response.status).toBe(200);
    }
  });

  it("should evict the oldest live session once the cap is exceeded", async () => {
    const user = await buildCustomer();

    const logins: Array<{ accessToken: string; refreshCookie: string }> = [];
    for (let i = 0; i < env.MAX_LIVE_SESSIONS + 1; i++) {
      logins.push(await loginWithSession(user.email, user.password));
    }

    const liveSessions = await prisma.session.findMany({
      where: {
        userId: user.id,
        usedAt: null,
        invalidatedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    expect(liveSessions).toHaveLength(env.MAX_LIVE_SESSIONS);

    const oldestLogin = logins[0] as { refreshCookie: string };
    const oldestId = await sessionIdFromCookie(oldestLogin.refreshCookie);
    const oldestSession = await prisma.session.findUniqueOrThrow({
      where: { id: oldestId },
    });
    expect(oldestSession.invalidatedAt).not.toBeNull();

    const newestLogin = logins.at(-1) as { refreshCookie: string };
    const newestId = await sessionIdFromCookie(newestLogin.refreshCookie);
    const liveIds = liveSessions.map((s) => s.id);
    expect(liveIds).toContain(newestId);
    expect(liveIds).not.toContain(oldestId);
  });

  it("should reject a refresh using the evicted session's refresh token", async () => {
    const user = await buildCustomer();

    const logins: Array<{ accessToken: string; refreshCookie: string }> = [];
    for (let i = 0; i < env.MAX_LIVE_SESSIONS + 1; i++) {
      logins.push(await loginWithSession(user.email, user.password));
    }

    const evicted = logins[0] as { refreshCookie: string };
    const response = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", evicted.refreshCookie);

    expect(response.status).toBe(401);
  });
});

describe("GET /api/v1/auth/sessions", () => {
  it("should return 401 if no access token is provided", async () => {
    const response = await request(app).get("/api/v1/auth/sessions");

    expect(response.status).toBe(401);
  });

  it("should return 403 if user does not have the read:session feature", async () => {
    const user = await buildCustomer({ denies: ["read:session"] });
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get("/api/v1/auth/sessions")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it("should list only the live sessions of the authenticated user", async () => {
    const user = await buildCustomer();

    // duas sessões que permanecem vivas
    const live1 = await loginWithSession(user.email, user.password);
    const live2 = await loginWithSession(user.email, user.password);

    // uma sessão rotacionada: a antiga fica morta (usedAt), nasce uma nova viva
    const toRotate = await loginWithSession(user.email, user.password);
    const rotateResponse = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", toRotate.refreshCookie);
    expect(rotateResponse.status).toBe(200);
    const rotatedChildCookie = extractRefreshCookie(rotateResponse);

    // uma sessão invalidada
    const toInvalidate = await loginWithSession(user.email, user.password);
    const invalidatedId = await sessionIdFromCookie(toInvalidate.refreshCookie);
    await prisma.session.update({
      where: { id: invalidatedId },
      data: { invalidatedAt: new Date() },
    });

    // uma sessão expirada
    const toExpire = await loginWithSession(user.email, user.password);
    const expiredId = await sessionIdFromCookie(toExpire.refreshCookie);
    await prisma.session.update({
      where: { id: expiredId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const [live1Id, live2Id, rotatedChildId, rotatedOldId] = await Promise.all([
      sessionIdFromCookie(live1.refreshCookie),
      sessionIdFromCookie(live2.refreshCookie),
      sessionIdFromCookie(rotatedChildCookie),
      sessionIdFromCookie(toRotate.refreshCookie),
    ]);

    const response = await request(app)
      .get("/api/v1/auth/sessions")
      .set("Authorization", `Bearer ${live1.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchView(z.array(sessionViews.default));
    expect(response.body.meta).toEqual({});

    const ids = (response.body.data as Array<{ id: string }>).map((s) => s.id);

    expect(ids).toHaveLength(3);
    expect(ids).toEqual(
      expect.arrayContaining([live1Id, live2Id, rotatedChildId]),
    );
    expect(ids).not.toContain(rotatedOldId);
    expect(ids).not.toContain(invalidatedId);
    expect(ids).not.toContain(expiredId);
  });

  it("should not include another user's sessions", async () => {
    const userA = await buildCustomer();
    const { accessToken } = await loginWithSession(userA.email, userA.password);

    const userB = await buildCustomer();
    const sessionB = await loginWithSession(userB.email, userB.password);
    const sessionBId = await sessionIdFromCookie(sessionB.refreshCookie);

    const response = await request(app)
      .get("/api/v1/auth/sessions")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);

    const ids = (response.body.data as Array<{ id: string }>).map((s) => s.id);
    expect(ids).not.toContain(sessionBId);
  });
});

describe("DELETE /api/v1/auth/sessions/:id", () => {
  it("should return 401 if no access token is provided", async () => {
    const response = await request(app).delete(
      "/api/v1/auth/sessions/00000000-0000-0000-0000-000000000000",
    );

    expect(response.status).toBe(401);
  });

  it("should return 403 if user does not have the manage:session feature", async () => {
    const user = await buildCustomer({ denies: ["manage:session"] });
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .delete("/api/v1/auth/sessions/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it("should return 422 if the session id is not a valid UUID", async () => {
    const user = await buildCustomer();
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .delete("/api/v1/auth/sessions/not-a-uuid")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(422);
    expectValidationError(response, ["id"]);
  });

  it("should return 404 if the session belongs to another user", async () => {
    const userA = await buildCustomer();
    const tokenA = await loginAs(userA.email, userA.password);

    const userB = await buildCustomer();
    const sessionB = await loginWithSession(userB.email, userB.password);
    const sessionBId = await sessionIdFromCookie(sessionB.refreshCookie);

    const response = await request(app)
      .delete(`/api/v1/auth/sessions/${sessionBId}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(response.status).toBe(404);
  });

  it("should return 404 if the session does not exist", async () => {
    const user = await buildCustomer();
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .delete("/api/v1/auth/sessions/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);
  });

  it("should return 404 if the session is already used (rotated)", async () => {
    const user = await buildCustomer();
    const token = await loginAs(user.email, user.password);

    const toRotate = await loginWithSession(user.email, user.password);
    const rotateResponse = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", toRotate.refreshCookie);
    expect(rotateResponse.status).toBe(200);

    const usedId = await sessionIdFromCookie(toRotate.refreshCookie);

    const response = await request(app)
      .delete(`/api/v1/auth/sessions/${usedId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);
  });

  it("should return 404 if the session is already invalidated", async () => {
    const user = await buildCustomer();
    const token = await loginAs(user.email, user.password);

    const toInvalidate = await loginWithSession(user.email, user.password);
    const invalidatedId = await sessionIdFromCookie(toInvalidate.refreshCookie);
    await prisma.session.update({
      where: { id: invalidatedId },
      data: { invalidatedAt: new Date() },
    });

    const response = await request(app)
      .delete(`/api/v1/auth/sessions/${invalidatedId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);
  });

  it("should return 404 if the session is already expired", async () => {
    const user = await buildCustomer();
    const token = await loginAs(user.email, user.password);

    const toExpire = await loginWithSession(user.email, user.password);
    const expiredId = await sessionIdFromCookie(toExpire.refreshCookie);
    await prisma.session.update({
      where: { id: expiredId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await request(app)
      .delete(`/api/v1/auth/sessions/${expiredId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);
  });

  it("should revoke a live session of the authenticated user", async () => {
    const user = await buildCustomer();
    const token = await loginAs(user.email, user.password);

    const session = await loginWithSession(user.email, user.password);
    const sessionId = await sessionIdFromCookie(session.refreshCookie);

    const response = await request(app)
      .delete(`/api/v1/auth/sessions/${sessionId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(204);

    const sessionInDb = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(sessionInDb.invalidatedAt).not.toBeNull();
  });

  it("should not affect other live sessions of the same user", async () => {
    const user = await buildCustomer();
    const token = await loginAs(user.email, user.password);

    const sessionA = await loginWithSession(user.email, user.password);
    const sessionAId = await sessionIdFromCookie(sessionA.refreshCookie);

    const sessionB = await loginWithSession(user.email, user.password);
    const sessionBId = await sessionIdFromCookie(sessionB.refreshCookie);

    const response = await request(app)
      .delete(`/api/v1/auth/sessions/${sessionAId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(204);

    const sessionBInDb = await prisma.session.findUniqueOrThrow({
      where: { id: sessionBId },
    });
    expect(sessionBInDb.invalidatedAt).toBeNull();
  });
});

describe("POST /api/v1/auth/verify-email", () => {
  it("should return 422 when the token is missing", async () => {
    const response = await request(app)
      .post("/api/v1/auth/verify-email")
      .send({});

    expect(response.status).toBe(422);
    expectValidationError(response, ["token"]);
  });

  it("should return 400 for a non-existent token", async () => {
    const response = await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ token: generateOpaqueToken() });

    expect(response.status).toBe(400);
  });

  it("should return 400 for an expired token", async () => {
    const user = await buildCustomer({ status: "PENDING" });
    const rawToken = await seedVerificationToken(user.id, {
      expiresAt: new Date(Date.now() - 1000),
    });

    const response = await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ token: rawToken });

    expect(response.status).toBe(400);

    const userInDb = await findUserById(user.id);
    expect(userInDb?.status).toBe("PENDING");
  });

  it("should return 400 for an already used token", async () => {
    const user = await buildCustomer({ status: "PENDING" });
    const rawToken = await seedVerificationToken(user.id, {
      usedAt: new Date(),
    });

    const response = await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ token: rawToken });

    expect(response.status).toBe(400);
  });

  it("should activate the account and consume the token on success", async () => {
    const user = await buildCustomer({ status: "PENDING" });
    const rawToken = await seedVerificationToken(user.id);

    const response = await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ token: rawToken });

    expect(response.status).toBe(204);

    const userInDb = await findUserById(user.id);
    expect(userInDb?.status).toBe("ACTIVE");

    const tokenInDb = await prisma.verificationToken.findFirst({
      where: { userId: user.id },
    });
    expect(tokenInDb?.usedAt).not.toBeNull();
  });

  it("should reject a second verification with the same token", async () => {
    const user = await buildCustomer({ status: "PENDING" });
    const rawToken = await seedVerificationToken(user.id);

    const first = await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ token: rawToken });
    expect(first.status).toBe(204);

    const second = await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ token: rawToken });
    expect(second.status).toBe(400);
  });
});

describe("POST /api/v1/auth/verify-email/resend", () => {
  it("should return 422 when the email is invalid", async () => {
    const response = await request(app)
      .post("/api/v1/auth/verify-email/resend")
      .send({ email: "not-an-email" });

    expect(response.status).toBe(422);
    expectValidationError(response, ["email"]);
  });

  it("should return 200 without sending for a non-existent email", async () => {
    const response = await request(app)
      .post("/api/v1/auth/verify-email/resend")
      .send({ email: "ghost@example.com" });

    expect(response.status).toBe(200);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("should return 200 without sending for an already active account", async () => {
    const user = await buildCustomer();

    const response = await request(app)
      .post("/api/v1/auth/verify-email/resend")
      .send({ email: user.email });

    expect(response.status).toBe(200);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("should return 200 without sending for a banned account", async () => {
    const user = await buildCustomer({ status: "PENDING" });
    await prisma.user.update({
      where: { id: user.id },
      data: { bannedAt: new Date(), banReason: "abuse" },
    });

    const response = await request(app)
      .post("/api/v1/auth/verify-email/resend")
      .send({ email: user.email });

    expect(response.status).toBe(200);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("should issue a new token and send for a pending, non-banned account", async () => {
    const user = await buildCustomer({ status: "PENDING" });

    const response = await request(app)
      .post("/api/v1/auth/verify-email/resend")
      .send({ email: user.email });

    expect(response.status).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: user.email }),
    );

    const tokens = await prisma.verificationToken.findMany({
      where: { userId: user.id, purpose: "EMAIL_VERIFICATION" },
    });
    expect(tokens).toHaveLength(1);
  });
});

describe("POST /api/v1/auth/forgot-password", () => {
  it("should return 422 when the email is invalid", async () => {
    const response = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "not-an-email" });

    expect(response.status).toBe(422);
    expectValidationError(response, ["email"]);
  });

  it("should return 200 without sending for a non-existent email", async () => {
    const response = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "ghost@example.com" });

    expect(response.status).toBe(200);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("should return 200 without sending for a pending account", async () => {
    const user = await buildCustomer({ status: "PENDING" });

    const response = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: user.email });

    expect(response.status).toBe(200);
    expect(sendMock).not.toHaveBeenCalled();

    const tokens = await prisma.verificationToken.findMany({
      where: { userId: user.id, purpose: "PASSWORD_RESET" },
    });
    expect(tokens).toHaveLength(0);
  });

  it("should return 200 without sending for a banned account", async () => {
    const user = await buildCustomer();
    await prisma.user.update({
      where: { id: user.id },
      data: { bannedAt: new Date(), banReason: "abuse" },
    });

    const response = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: user.email });

    expect(response.status).toBe(200);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("should issue a PASSWORD_RESET token and send for an active, non-banned account", async () => {
    const user = await buildCustomer();

    const response = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: user.email });

    expect(response.status).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: user.email }),
    );

    const tokens = await prisma.verificationToken.findMany({
      where: { userId: user.id, purpose: "PASSWORD_RESET" },
    });
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.usedAt).toBeNull();
  });
});

describe("POST /api/v1/auth/reset-password", () => {
  const NEW_PASSWORD = "NewPass@123";

  it("should return 422 when the token is missing", async () => {
    const response = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ newPassword: NEW_PASSWORD });

    expect(response.status).toBe(422);
    expectValidationError(response, ["token"]);
  });

  it("should return 422 when the new password is too weak", async () => {
    const user = await buildCustomer();
    const rawToken = await seedVerificationToken(user.id, {
      purpose: "PASSWORD_RESET",
    });

    const response = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: rawToken, newPassword: "weak" });

    expect(response.status).toBe(422);
    expectValidationError(response, ["newPassword"]);
  });

  it("should return 400 for a non-existent token", async () => {
    const response = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: generateOpaqueToken(), newPassword: NEW_PASSWORD });

    expect(response.status).toBe(400);
  });

  it("should return 400 for an expired token", async () => {
    const user = await buildCustomer();
    const rawToken = await seedVerificationToken(user.id, {
      purpose: "PASSWORD_RESET",
      expiresAt: new Date(Date.now() - 1000),
    });

    const response = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: rawToken, newPassword: NEW_PASSWORD });

    expect(response.status).toBe(400);
  });

  it("should return 400 for an already used token", async () => {
    const user = await buildCustomer();
    const rawToken = await seedVerificationToken(user.id, {
      purpose: "PASSWORD_RESET",
      usedAt: new Date(),
    });

    const response = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: rawToken, newPassword: NEW_PASSWORD });

    expect(response.status).toBe(400);
  });

  it("should return 400 for a token of the wrong purpose", async () => {
    const user = await buildCustomer();
    const rawToken = await seedVerificationToken(user.id, {
      purpose: "EMAIL_VERIFICATION",
    });

    const response = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: rawToken, newPassword: NEW_PASSWORD });

    expect(response.status).toBe(400);
  });

  it("should reset the password, consume the token and invalidate all sessions", async () => {
    const user = await buildCustomer();
    const { refreshCookie } = await loginWithSession(user.email, user.password);
    const rawToken = await seedVerificationToken(user.id, {
      purpose: "PASSWORD_RESET",
    });

    const response = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: rawToken, newPassword: NEW_PASSWORD });

    expect(response.status).toBe(204);

    const oldLogin = await request(app).post("/api/v1/auth/login").send({
      email: user.email,
      password: user.password,
    });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app).post("/api/v1/auth/login").send({
      email: user.email,
      password: NEW_PASSWORD,
    });
    expect(newLogin.status).toBe(200);

    const tokenInDb = await prisma.verificationToken.findFirst({
      where: { userId: user.id, purpose: "PASSWORD_RESET" },
    });
    expect(tokenInDb?.usedAt).not.toBeNull();

    const refreshResponse = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", refreshCookie);
    expect(refreshResponse.status).toBe(401);
  });

  it("should reject reusing the same reset token", async () => {
    const user = await buildCustomer();
    const rawToken = await seedVerificationToken(user.id, {
      purpose: "PASSWORD_RESET",
    });

    const first = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: rawToken, newPassword: NEW_PASSWORD });
    expect(first.status).toBe(204);

    const second = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: rawToken, newPassword: "Other@1234" });
    expect(second.status).toBe(400);
  });

  it("should return 403 for a banned account even with a valid token", async () => {
    const user = await buildCustomer();
    await prisma.user.update({
      where: { id: user.id },
      data: { bannedAt: new Date(), banReason: "abuse" },
    });
    const rawToken = await seedVerificationToken(user.id, {
      purpose: "PASSWORD_RESET",
    });

    const response = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: rawToken, newPassword: NEW_PASSWORD });

    expect(response.status).toBe(403);

    // password unchanged, token not consumed
    const oldLogin = await request(app).post("/api/v1/auth/login").send({
      email: user.email,
      password: user.password,
    });
    expect(oldLogin.status).toBe(403); // banned gate
    const tokenInDb = await prisma.verificationToken.findFirst({
      where: { userId: user.id, purpose: "PASSWORD_RESET" },
    });
    expect(tokenInDb?.usedAt).toBeNull();
  });
});

describe("POST /api/v1/auth/change-password", () => {
  const NEW_PASSWORD = "NewPass@123";

  it("should return 401 without an access token", async () => {
    const response = await request(app)
      .post("/api/v1/auth/change-password")
      .send({ currentPassword: "Whatever@1", newPassword: NEW_PASSWORD });

    expect(response.status).toBe(401);
  });

  it("should return 422 when the new password is too weak", async () => {
    const user = await buildCustomer();
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .post("/api/v1/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: user.password, newPassword: "weak" });

    expect(response.status).toBe(422);
    expectValidationError(response, ["newPassword"]);
  });

  it("should return 422 when currentPassword is missing", async () => {
    const user = await buildCustomer();
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .post("/api/v1/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ newPassword: NEW_PASSWORD });

    expect(response.status).toBe(422);
    expectValidationError(response, ["currentPassword"]);
  });

  it("should return 403 when the current password is incorrect", async () => {
    const user = await buildCustomer();
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .post("/api/v1/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "WrongPass@1", newPassword: NEW_PASSWORD });

    expect(response.status).toBe(403);

    // password unchanged: the old one still logs in
    const oldLogin = await request(app).post("/api/v1/auth/login").send({
      email: user.email,
      password: user.password,
    });
    expect(oldLogin.status).toBe(200);

    // no session was invalidated
    const sessions = await prisma.session.findMany({
      where: { userId: user.id },
    });
    expect(sessions.every((s) => s.invalidatedAt === null)).toBe(true);
  });

  it("should change the password and invalidate all sessions on success", async () => {
    const user = await buildCustomer();
    const { accessToken, refreshCookie } = await loginWithSession(
      user.email,
      user.password,
    );

    const response = await request(app)
      .post("/api/v1/auth/change-password")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ currentPassword: user.password, newPassword: NEW_PASSWORD });

    expect(response.status).toBe(204);

    const oldLogin = await request(app).post("/api/v1/auth/login").send({
      email: user.email,
      password: user.password,
    });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app).post("/api/v1/auth/login").send({
      email: user.email,
      password: NEW_PASSWORD,
    });
    expect(newLogin.status).toBe(200);

    const refreshResponse = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", refreshCookie);
    expect(refreshResponse.status).toBe(401);
  });

  it("should return 403 for a banned account with a still-valid access token", async () => {
    const user = await buildCustomer();
    const token = await loginAs(user.email, user.password);
    await prisma.user.update({
      where: { id: user.id },
      data: { bannedAt: new Date(), banReason: "abuse" },
    });

    const response = await request(app)
      .post("/api/v1/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: user.password, newPassword: NEW_PASSWORD });

    expect(response.status).toBe(403);
  });
});

describe("POST /api/v1/auth/change-email", () => {
  it("should return 401 without an access token", async () => {
    const response = await request(app)
      .post("/api/v1/auth/change-email")
      .send({ currentPassword: "Whatever@1", newEmail: "new@example.com" });

    expect(response.status).toBe(401);
  });

  it("should return 403 without the update:user feature", async () => {
    const user = await buildCustomer({ denies: ["update:user"] });
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .post("/api/v1/auth/change-email")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: user.password, newEmail: "new@example.com" });

    expect(response.status).toBe(403);
  });

  it("should return 422 when currentPassword is missing", async () => {
    const user = await buildCustomer();
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .post("/api/v1/auth/change-email")
      .set("Authorization", `Bearer ${token}`)
      .send({ newEmail: "new@example.com" });

    expect(response.status).toBe(422);
    expectValidationError(response, ["currentPassword"]);
  });

  it("should return 422 when newEmail is not a valid email", async () => {
    const user = await buildCustomer();
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .post("/api/v1/auth/change-email")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: user.password, newEmail: "not-an-email" });

    expect(response.status).toBe(422);
    expectValidationError(response, ["newEmail"]);
  });

  it("should return 403 when the current password is incorrect", async () => {
    const user = await buildCustomer();
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .post("/api/v1/auth/change-email")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "WrongPass@1", newEmail: "new@example.com" });

    expect(response.status).toBe(403);

    const userInDb = await findUserById(user.id);
    expect(userInDb?.pendingEmail).toBeNull();
  });

  it("should return 409 when newEmail is the same as the current email", async () => {
    const user = await buildCustomer();
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .post("/api/v1/auth/change-email")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: user.password, newEmail: user.email });

    expect(response.status).toBe(409);
  });

  it("should return 409 when newEmail is already active on another account", async () => {
    const user = await buildCustomer();
    const other = await buildCustomer();
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .post("/api/v1/auth/change-email")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: user.password, newEmail: other.email });

    expect(response.status).toBe(409);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("should return 409 when newEmail was previously used by another account", async () => {
    const user = await buildCustomer();
    const other = await buildCustomer();
    const token = await loginAs(user.email, user.password);
    const reservedEmail = "reserved@example.com";
    await prisma.previousEmail.create({
      data: { userId: other.id, email: reservedEmail, replacedAt: new Date() },
    });

    const response = await request(app)
      .post("/api/v1/auth/change-email")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: user.password, newEmail: reservedEmail });

    expect(response.status).toBe(409);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("should return 403 for a banned account", async () => {
    const user = await buildCustomer();
    const token = await loginAs(user.email, user.password);
    await prisma.user.update({
      where: { id: user.id },
      data: { bannedAt: new Date(), banReason: "abuse" },
    });

    const response = await request(app)
      .post("/api/v1/auth/change-email")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: user.password, newEmail: "new@example.com" });

    expect(response.status).toBe(403);
  });

  it("should set pendingEmail, create the token and notify the OLD email on success", async () => {
    const user = await buildCustomer();
    const token = await loginAs(user.email, user.password);
    const newEmail = "new@example.com";

    const response = await request(app)
      .post("/api/v1/auth/change-email")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: user.password, newEmail });

    expect(response.status).toBe(204);

    const userInDb = await findUserById(user.id);
    expect(userInDb?.pendingEmail).toBe(newEmail);
    expect(userInDb?.email).toBe(user.email);

    const tokenInDb = await prisma.verificationToken.findFirst({
      where: { userId: user.id, purpose: "EMAIL_CHANGE" },
    });
    expect(tokenInDb?.newEmail).toBe(newEmail);
    expect(tokenInDb?.usedAt).toBeNull();

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: user.email }),
    );

    const rows = await prisma.auditLog.findMany({
      where: { action: "EMAIL_CHANGE_REQUESTED", targetId: user.id },
    });
    expect(rows).toHaveLength(1);
  });

  it("should invalidate the previous pending token when a new change is requested", async () => {
    const user = await buildCustomer();
    const token = await loginAs(user.email, user.password);

    await request(app)
      .post("/api/v1/auth/change-email")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: user.password, newEmail: "first@example.com" });
    const firstToken = tokenFromLastEmail();

    await request(app)
      .post("/api/v1/auth/change-email")
      .set("Authorization", `Bearer ${token}`)
      .send({
        currentPassword: user.password,
        newEmail: "second@example.com",
      });

    const userInDb = await findUserById(user.id);
    expect(userInDb?.pendingEmail).toBe("second@example.com");

    const confirmResponse = await request(app)
      .post("/api/v1/auth/confirm-email-change")
      .send({ token: firstToken });

    expect(confirmResponse.status).toBe(400);
  });
});

describe("POST /api/v1/auth/confirm-email-change", () => {
  it("should return 422 when token is missing", async () => {
    const response = await request(app)
      .post("/api/v1/auth/confirm-email-change")
      .send({});

    expect(response.status).toBe(422);
    expectValidationError(response, ["token"]);
  });

  it("should return 400 for an unknown token", async () => {
    const response = await request(app)
      .post("/api/v1/auth/confirm-email-change")
      .send({ token: generateOpaqueToken() });

    expect(response.status).toBe(400);
  });

  it("should return 400 for a token with the wrong purpose", async () => {
    const user = await buildCustomer();
    const token = await seedVerificationToken(user.id, {
      purpose: "PASSWORD_RESET",
    });

    const response = await request(app)
      .post("/api/v1/auth/confirm-email-change")
      .send({ token });

    expect(response.status).toBe(400);
  });

  it("should return 400 for an expired token and not change the email", async () => {
    const user = await buildCustomer();
    const token = await seedVerificationToken(user.id, {
      purpose: "EMAIL_CHANGE",
      newEmail: "new@example.com",
      expiresAt: new Date(Date.now() - 1000),
    });

    const response = await request(app)
      .post("/api/v1/auth/confirm-email-change")
      .send({ token });

    expect(response.status).toBe(400);
    const userInDb = await findUserById(user.id);
    expect(userInDb?.email).toBe(user.email);
  });

  it("should return 400 for an already used token", async () => {
    const user = await buildCustomer();
    const token = await seedVerificationToken(user.id, {
      purpose: "EMAIL_CHANGE",
      newEmail: "new@example.com",
      usedAt: new Date(),
    });

    const response = await request(app)
      .post("/api/v1/auth/confirm-email-change")
      .send({ token });

    expect(response.status).toBe(400);
  });

  it("should complete the email change, record PreviousEmail and the audit log", async () => {
    const user = await buildCustomer();
    const newEmail = "new@example.com";
    const token = await seedVerificationToken(user.id, {
      purpose: "EMAIL_CHANGE",
      newEmail,
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { pendingEmail: newEmail },
    });

    const response = await request(app)
      .post("/api/v1/auth/confirm-email-change")
      .send({ token });

    expect(response.status).toBe(204);

    const userInDb = await findUserById(user.id);
    expect(userInDb?.email).toBe(newEmail);
    expect(userInDb?.pendingEmail).toBeNull();

    const previous = await prisma.previousEmail.findFirst({
      where: { userId: user.id },
    });
    expect(previous?.email).toBe(user.email);

    const tokenInDb = await prisma.verificationToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    expect(tokenInDb?.usedAt).not.toBeNull();

    const rows = await prisma.auditLog.findMany({
      where: { action: "EMAIL_CHANGE_COMPLETED", targetId: user.id },
    });
    expect(rows).toHaveLength(1);
  });

  it("should return 400 when reusing an already-confirmed token", async () => {
    const user = await buildCustomer();
    const newEmail = "new@example.com";
    const token = await seedVerificationToken(user.id, {
      purpose: "EMAIL_CHANGE",
      newEmail,
    });

    const first = await request(app)
      .post("/api/v1/auth/confirm-email-change")
      .send({ token });
    expect(first.status).toBe(204);

    const second = await request(app)
      .post("/api/v1/auth/confirm-email-change")
      .send({ token });
    expect(second.status).toBe(400);
  });

  it("should return 409 when the email got taken right before confirmation", async () => {
    const user = await buildCustomer();
    const other = await buildCustomer();
    const newEmail = "raced@example.com";
    const token = await seedVerificationToken(user.id, {
      purpose: "EMAIL_CHANGE",
      newEmail,
    });

    // race: someone else grabs the target email between request and confirm
    await prisma.user.update({
      where: { id: other.id },
      data: { email: newEmail },
    });

    const response = await request(app)
      .post("/api/v1/auth/confirm-email-change")
      .send({ token });

    expect(response.status).toBe(409);
  });
});

describe("Rate limiting (7.9)", () => {
  it("allows login attempts within RATE_LIMIT_LOGIN_MAX", async () => {
    const user = await buildCustomer();

    for (let i = 0; i < env.RATE_LIMIT_LOGIN_MAX; i++) {
      const response = await request(app).post("/api/v1/auth/login").send({
        email: user.email,
        password: "wrongpassword",
      });
      expect(response.status).toBe(401);
    }
  });

  it("returns a generic 429 with Retry-After once RATE_LIMIT_LOGIN_MAX is exceeded, by IP", async () => {
    const user = await buildCustomer();

    for (let i = 0; i < env.RATE_LIMIT_LOGIN_MAX; i++) {
      await request(app).post("/api/v1/auth/login").send({
        email: user.email,
        password: "wrongpassword",
      });
    }

    const response = await request(app).post("/api/v1/auth/login").send({
      email: user.email,
      password: "wrongpassword",
    });

    expect(response.status).toBe(429);
    expect(response.headers["retry-after"]).toBeDefined();
    // Genérico: não revela qual regra disparou nem confirma a conta.
    expect(response.body).not.toHaveProperty("rule");
  });

  it("keeps login rate limit counters isolated per IP", async () => {
    const user = await buildCustomer();

    for (let i = 0; i < env.RATE_LIMIT_LOGIN_MAX; i++) {
      await request(app)
        .post("/api/v1/auth/login")
        .set("X-Forwarded-For", "203.0.113.10")
        .send({ email: user.email, password: "wrongpassword" });
    }

    const sameIp = await request(app)
      .post("/api/v1/auth/login")
      .set("X-Forwarded-For", "203.0.113.10")
      .send({ email: user.email, password: "wrongpassword" });
    expect(sameIp.status).toBe(429);

    const otherIp = await request(app)
      .post("/api/v1/auth/login")
      .set("X-Forwarded-For", "203.0.113.99")
      .send({ email: user.email, password: "wrongpassword" });
    expect(otherIp.status).toBe(401);
  });

  it("records AUTH_RATE_LIMIT_EXCEEDED in the audit log without PII", async () => {
    const user = await buildCustomer();

    for (let i = 0; i <= env.RATE_LIMIT_LOGIN_MAX; i++) {
      await request(app).post("/api/v1/auth/login").send({
        email: user.email,
        password: "wrongpassword",
      });
    }

    const rows = await prisma.auditLog.findMany({
      where: { action: "AUTH_RATE_LIMIT_EXCEEDED" },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.targetType).toBe("Route");
    expect(rows[0]?.metadata).toEqual({ rule: "login", scope: "IP" });
  });

  it("returns 429 once RATE_LIMIT_SIGNUP_MAX is exceeded, by IP", async () => {
    for (let i = 0; i < env.RATE_LIMIT_SIGNUP_MAX; i++) {
      const response = await request(app)
        .post("/api/v1/auth/signup")
        .send(makeCustomerData());
      expect(response.status).toBe(201);
    }

    const response = await request(app)
      .post("/api/v1/auth/signup")
      .send(makeCustomerData());

    expect(response.status).toBe(429);
  });

  it("returns 429 on forgot-password once the per-IP email limit is exceeded", async () => {
    const user = await buildCustomer();

    for (let i = 0; i < env.RATE_LIMIT_EMAIL_MAX; i++) {
      const response = await request(app)
        .post("/api/v1/auth/forgot-password")
        .send({ email: user.email });
      expect(response.status).toBe(200);
    }

    const response = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: user.email });

    expect(response.status).toBe(429);
  });

  it("returns 429 on forgot-password once the per-email-target limit is exceeded, even from different IPs", async () => {
    const user = await buildCustomer();

    for (let i = 0; i < env.RATE_LIMIT_EMAIL_TARGET_MAX; i++) {
      const response = await request(app)
        .post("/api/v1/auth/forgot-password")
        .set("X-Forwarded-For", `198.51.100.${i}`)
        .send({ email: user.email });
      expect(response.status).toBe(200);
    }

    const response = await request(app)
      .post("/api/v1/auth/forgot-password")
      .set("X-Forwarded-For", "198.51.100.250")
      .send({ email: user.email });

    expect(response.status).toBe(429);
  });

  it("returns 429 on verify-email/resend once the per-IP email limit is exceeded", async () => {
    const user = await buildCustomer({ status: "PENDING" });

    for (let i = 0; i < env.RATE_LIMIT_EMAIL_MAX; i++) {
      const response = await request(app)
        .post("/api/v1/auth/verify-email/resend")
        .send({ email: user.email });
      expect(response.status).toBe(200);
    }

    const response = await request(app)
      .post("/api/v1/auth/verify-email/resend")
      .send({ email: user.email });

    expect(response.status).toBe(429);
  });
});

describe("Account lockout (7.10)", () => {
  it("does not lock the account before LOCKOUT_THRESHOLD wrong attempts", async () => {
    const user = await buildCustomer();

    for (let i = 0; i < env.LOCKOUT_THRESHOLD - 1; i++) {
      const response = await request(app).post("/api/v1/auth/login").send({
        email: user.email,
        password: "wrongpassword",
      });
      expect(response.status).toBe(401);
    }

    const response = await request(app).post("/api/v1/auth/login").send({
      email: user.email,
      password: user.password,
    });

    expect(response.status).toBe(200);
  });

  it("returns 429 for the correct password once LOCKOUT_THRESHOLD is reached", async () => {
    const user = await buildCustomer();

    for (let i = 0; i < env.LOCKOUT_THRESHOLD; i++) {
      await request(app).post("/api/v1/auth/login").send({
        email: user.email,
        password: "wrongpassword",
      });
    }

    const response = await request(app).post("/api/v1/auth/login").send({
      email: user.email,
      password: user.password,
    });

    expect(response.status).toBe(429);
  });

  it("keeps returning 401 (not 429) for wrong attempts made while locked", async () => {
    const user = await buildCustomer();

    for (let i = 0; i < env.LOCKOUT_THRESHOLD; i++) {
      await request(app).post("/api/v1/auth/login").send({
        email: user.email,
        password: "wrongpassword",
      });
    }

    // wrong password never leaks lock state — no hint before the credential
    // is proven correct.
    const response = await request(app).post("/api/v1/auth/login").send({
      email: user.email,
      password: "wrongpassword",
    });

    expect(response.status).toBe(401);
  });

  it("records AUTH_LOCKOUT_TRIGGERED once the threshold is reached", async () => {
    const user = await buildCustomer();

    for (let i = 0; i < env.LOCKOUT_THRESHOLD; i++) {
      await request(app).post("/api/v1/auth/login").send({
        email: user.email,
        password: "wrongpassword",
      });
    }

    const rows = await prisma.auditLog.findMany({
      where: { action: "AUTH_LOCKOUT_TRIGGERED", targetId: user.id },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.metadata).toMatchObject({
      failureCount: env.LOCKOUT_THRESHOLD,
      backoffLevel: 1,
    });
  });

  it("records AUTH_LOGIN_FAILED with reason LOCKED for the correct password while locked", async () => {
    const user = await buildCustomer();

    for (let i = 0; i < env.LOCKOUT_THRESHOLD; i++) {
      await request(app).post("/api/v1/auth/login").send({
        email: user.email,
        password: "wrongpassword",
      });
    }

    await request(app).post("/api/v1/auth/login").send({
      email: user.email,
      password: user.password,
    });

    const rows = await prisma.auditLog.findMany({
      where: { action: "AUTH_LOGIN_FAILED", targetId: user.id },
    });

    const lockedRows = rows.filter(
      (row) =>
        row.metadata !== null &&
        typeof row.metadata === "object" &&
        (row.metadata as { reason?: string }).reason === "LOCKED",
    );

    expect(lockedRows).toHaveLength(1);
  });

  it("resets the failure counter on a successful login, without recording AUTH_LOCKOUT_CLEARED for a clean account", async () => {
    const user = await buildCustomer();

    const response = await request(app).post("/api/v1/auth/login").send({
      email: user.email,
      password: user.password,
    });
    expect(response.status).toBe(200);

    const rows = await prisma.auditLog.findMany({
      where: { action: "AUTH_LOCKOUT_CLEARED", targetId: user.id },
    });
    expect(rows).toHaveLength(0);
  });
});

describe("End-to-end: signup -> login -> me -> refresh -> sessions -> logout", () => {
  it("should support the full auth lifecycle for a freshly signed-up customer", async () => {
    const data = makeCustomerData();

    const signupResponse = await request(app)
      .post("/api/v1/auth/signup")
      .send(data);
    expect(signupResponse.status).toBe(201);

    const verifyResponse = await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ token: tokenFromLastEmail() });
    expect(verifyResponse.status).toBe(204);

    const loginResponse = await request(app).post("/api/v1/auth/login").send({
      email: data.email,
      password: data.password,
    });
    expect(loginResponse.status).toBe(200);
    const accessToken = loginResponse.body.accessToken as string;
    const refreshCookie = extractRefreshCookie(loginResponse);

    const meResponse = await request(app)
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(meResponse.status).toBe(200);
    expect(meResponse.body.customer).not.toBeNull();
    expect(meResponse.body.customer.roles).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "customer" })]),
    );
    expect(meResponse.body.features).toEqual(
      expect.arrayContaining([
        "read:user",
        "update:user",
        "delete:user",
        "read:session",
        "manage:session",
      ]),
    );

    const refreshResponse = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", refreshCookie);
    expect(refreshResponse.status).toBe(200);
    const newAccessToken = refreshResponse.body.accessToken as string;
    const newRefreshCookie = extractRefreshCookie(refreshResponse);

    const meAfterRefresh = await request(app)
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${newAccessToken}`);
    expect(meAfterRefresh.status).toBe(200);

    const sessionsResponse = await request(app)
      .get("/api/v1/auth/sessions")
      .set("Authorization", `Bearer ${newAccessToken}`);
    expect(sessionsResponse.status).toBe(200);
    expect(sessionsResponse.body.data).toHaveLength(1);
    const sessionId = (sessionsResponse.body.data as Array<{ id: string }>)[0]
      ?.id;
    assert(sessionId !== undefined, "Session id should be defined");

    const logoutResponse = await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${newAccessToken}`)
      .set("Cookie", newRefreshCookie);
    expect(logoutResponse.status).toBe(204);

    const sessionInDb = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(sessionInDb.invalidatedAt).not.toBeNull();
  });
});

describe("Malformed request body", () => {
  it("should return 400 (not 500) for an unparseable JSON body", async () => {
    const response = await request(app)
      .post("/api/v1/auth/signup")
      .set("Content-Type", "application/json")
      .send("not json");

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: "BAD_REQUEST",
      message: expect.any(String),
      action: expect.any(String),
    });
  });

  it("should return 400 for a top-level non-object JSON body", async () => {
    const response = await request(app)
      .post("/api/v1/auth/signup")
      .set("Content-Type", "application/json")
      .send("null");

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("BAD_REQUEST");
  });
});

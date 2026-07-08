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
import {
  buildCustomer,
  makeCustomerData,
} from "@/__tests__/factories/user.factory";
import {
  expectValidationError,
  expectValidUuid,
} from "@/__tests__/helpers/assertions";
import {
  extractRefreshCookie,
  loginAs,
  loginWithSession,
} from "@/__tests__/helpers/auth";
import { clearDatabase } from "@/__tests__/helpers/database";
import app from "@/app";
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
    purpose?: "EMAIL_VERIFICATION" | "PASSWORD_RESET";
    expiresAt?: Date;
    usedAt?: Date | null;
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
    expect(response.body).toMatchView(z.array(sessionViews.default));

    const ids = (response.body as Array<{ id: string }>).map((s) => s.id);

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

    const ids = (response.body as Array<{ id: string }>).map((s) => s.id);
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
    expect(sessionsResponse.body).toHaveLength(1);
    const sessionId = (sessionsResponse.body as Array<{ id: string }>)[0]?.id;
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

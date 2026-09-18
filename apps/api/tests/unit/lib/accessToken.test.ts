import { forgeAccessToken } from "@tests/helpers/auth";
import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { env } from "@/config/env";
import {
  ACCESS_TOKEN_ALGORITHM,
  ACCESS_TOKEN_AUDIENCE,
  ACCESS_TOKEN_CLOCK_TOLERANCE_SECONDS,
  ACCESS_TOKEN_ISSUER,
  signAccessToken,
  verifyAccessToken,
} from "@/lib/accessToken";

/**
 * Endurecimento da verificação do JWT (10.10): algoritmo pinado, `iss`/`aud`
 * exigidos, tolerância de relógio explícita. Cada caso de recusa forja um token
 * com o **mesmo segredo** e só uma coisa fora do lugar (`forgeAccessToken`) —
 * é o que prova que a recusa vem da claim, não da assinatura.
 */

const userId = "user-id-123";

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function forge(options: jwt.SignOptions = {}): string {
  return forgeAccessToken({ sub: userId }, options);
}

describe("accessToken", () => {
  describe("the happy path survives the hardening", () => {
    it("accepts a token signed by signAccessToken and returns its subject", () => {
      const token = signAccessToken(userId);

      expect(verifyAccessToken(token)).toBe(userId);
    });

    it("issues the pinned algorithm, issuer and audience", () => {
      const token = signAccessToken(userId);
      const decoded = jwt.decode(token, { complete: true });

      expect(decoded?.header.alg).toBe(ACCESS_TOKEN_ALGORITHM);
      expect(decoded?.payload).toMatchObject({
        sub: userId,
        iss: ACCESS_TOKEN_ISSUER,
        aud: ACCESS_TOKEN_AUDIENCE,
      });
    });
  });

  describe("algorithm is pinned", () => {
    it("rejects a token signed with the same secret under another HMAC algorithm", () => {
      const token = forge({ algorithm: "HS512" });

      expect(verifyAccessToken(token)).toBeNull();
    });

    it("rejects an unsigned token (alg: none) with otherwise valid claims", () => {
      const header = base64url({ alg: "none", typ: "JWT" });
      const now = Math.floor(Date.now() / 1000);
      const payload = base64url({
        sub: userId,
        iss: ACCESS_TOKEN_ISSUER,
        aud: ACCESS_TOKEN_AUDIENCE,
        iat: now,
        exp: now + 900,
      });

      expect(verifyAccessToken(`${header}.${payload}.`)).toBeNull();
    });
  });

  describe("issuer and audience are required and validated", () => {
    it("rejects a token from another issuer", () => {
      const token = forge({ issuer: "someone-else" });

      expect(verifyAccessToken(token)).toBeNull();
    });

    it("rejects a token meant for another audience", () => {
      const token = forge({ audience: "some-other-service" });

      expect(verifyAccessToken(token)).toBeNull();
    });

    it("rejects a token without iss/aud — the shape issued before 10.10", () => {
      const token = jwt.sign({ sub: userId }, env.JWT_SECRET, {
        algorithm: ACCESS_TOKEN_ALGORITHM,
        expiresIn: "15m",
      });

      expect(verifyAccessToken(token)).toBeNull();
    });
  });

  describe("clock tolerance is explicit", () => {
    it("accepts a token that expired within the tolerance", () => {
      // Um segundo dentro, não um segundo antes da borda: a assinatura e a
      // verificação podem cair em segundos diferentes do relógio.
      const token = forge({ expiresIn: -1 });

      expect(verifyAccessToken(token)).toBe(userId);
    });

    it("rejects a token that expired past the tolerance", () => {
      const token = forge({
        expiresIn: -(ACCESS_TOKEN_CLOCK_TOLERANCE_SECONDS + 5),
      });

      expect(verifyAccessToken(token)).toBeNull();
    });
  });

  describe("subject is mandatory", () => {
    it("rejects a well-formed token without sub", () => {
      const token = forgeAccessToken({});

      expect(verifyAccessToken(token)).toBeNull();
    });

    it("rejects garbage", () => {
      expect(verifyAccessToken("not-a-real-jwt")).toBeNull();
    });
  });
});

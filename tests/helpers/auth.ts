import jwt from "jsonwebtoken";
import type { StringValue } from "ms";
import request from "supertest";
import app from "@/app";
import { env } from "@/config/env";
import {
  ACCESS_TOKEN_ALGORITHM,
  ACCESS_TOKEN_AUDIENCE,
  ACCESS_TOKEN_ISSUER,
} from "@/lib/accessToken";
import { REFRESH_TOKEN_COOKIE_NAME } from "@/modules/auth/auth.constants";

/**
 * Assina com o **mesmo segredo** e o contrato inteiro do access token (10.10):
 * quem quer provar uma recusa passa em `options` a única peça fora do lugar,
 * para que a recusa venha da claim — e não da assinatura.
 */
export function forgeAccessToken(
  payload: object,
  options: jwt.SignOptions = {},
): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: ACCESS_TOKEN_ALGORITHM,
    issuer: ACCESS_TOKEN_ISSUER,
    audience: ACCESS_TOKEN_AUDIENCE,
    expiresIn: env.JWT_EXPIRES_IN as StringValue,
    ...options,
  });
}

export async function loginAs(email: string, password: string) {
  const response = await request(app).post("/api/v1/auth/login").send({
    email,
    password,
  });
  return response.body.accessToken as string;
}

export function extractRefreshCookie(response: request.Response): string {
  const setCookieHeader = response.headers["set-cookie"] as unknown as
    | string[]
    | undefined;
  const refreshCookie = setCookieHeader?.find((cookie) =>
    cookie.startsWith(`${REFRESH_TOKEN_COOKIE_NAME}=`),
  );
  if (!refreshCookie) {
    throw new Error("Refresh cookie not found in response headers");
  }
  return refreshCookie.split(";")[0] as string;
}

export async function loginWithSession(email: string, password: string) {
  const response = await request(app).post("/api/v1/auth/login").send({
    email,
    password,
  });
  return {
    accessToken: response.body.accessToken as string,
    refreshCookie: extractRefreshCookie(response),
  };
}

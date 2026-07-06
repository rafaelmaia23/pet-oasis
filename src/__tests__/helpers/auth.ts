import request from "supertest";
import app from "@/app";
import { REFRESH_TOKEN_COOKIE_NAME } from "@/modules/auth/auth.constants";

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

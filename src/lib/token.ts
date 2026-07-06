import { createHash, randomBytes } from "node:crypto";

const REFRESH_TOKEN_BYTES = 32;

function generateOpaqueRefreshToken(): string {
  return randomBytes(REFRESH_TOKEN_BYTES).toString("hex");
}

function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export { generateOpaqueRefreshToken, hashRefreshToken };

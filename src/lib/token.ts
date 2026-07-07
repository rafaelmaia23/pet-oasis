import { createHash, randomBytes } from "node:crypto";

const OPAQUE_TOKEN_BYTES = 32;

function generateOpaqueToken(): string {
  return randomBytes(OPAQUE_TOKEN_BYTES).toString("hex");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export { generateOpaqueToken, hashToken };

import { createHash, randomBytes } from "node:crypto";
import { OPAQUE_TOKEN_LENGTH } from "@pet-oasis/api-contracts/auth";

/**
 * O comprimento do token em hex é contrato (é o teto dos campos `token` dos
 * schemas de auth, 10.13); os bytes são derivados dele para que o gerador e o
 * schema nunca discordem — cada byte vira dois caracteres hex.
 */
const OPAQUE_TOKEN_BYTES = OPAQUE_TOKEN_LENGTH / 2;

function generateOpaqueToken(): string {
  return randomBytes(OPAQUE_TOKEN_BYTES).toString("hex");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export { generateOpaqueToken, hashToken };

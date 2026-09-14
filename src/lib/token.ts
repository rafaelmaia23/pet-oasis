import { createHash, randomBytes } from "node:crypto";

const OPAQUE_TOKEN_BYTES = 32;

/**
 * Comprimento do token em hex, que é o que viaja na URL e volta no corpo. É o
 * teto dos campos `token` dos schemas (10.13): um valor de outro tamanho não
 * pode casar com hash nenhum, então recusá-lo antes do banco não muda o
 * resultado — só o custo.
 */
const OPAQUE_TOKEN_LENGTH = OPAQUE_TOKEN_BYTES * 2;

function generateOpaqueToken(): string {
  return randomBytes(OPAQUE_TOKEN_BYTES).toString("hex");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export { generateOpaqueToken, hashToken, OPAQUE_TOKEN_LENGTH };

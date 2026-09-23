import { createHash, randomBytes } from "node:crypto";

/**
 * A entropia do token é decisão da API, não do contrato. O que o contrato fixa
 * é o comprimento em hex que atravessa a rede (`OPAQUE_TOKEN_LENGTH`, teto dos
 * campos `token` dos schemas de auth, 10.13) — e `tests/unit/lib/token.test.ts`
 * prova que o gerador emite exatamente esse comprimento, para que mexer num
 * dos dois lados sem o outro fique vermelho em vez de recusar todo token.
 */
const OPAQUE_TOKEN_BYTES = 32;

function generateOpaqueToken(): string {
  return randomBytes(OPAQUE_TOKEN_BYTES).toString("hex");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export { generateOpaqueToken, hashToken };

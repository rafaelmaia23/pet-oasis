import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import { env } from "@/config/env";

const SALT_ROUNDS = process.env.NODE_ENV === "test" ? 4 : 12;

function applyPepper(password: string): string {
  return `${password}${env.PEPPER}`;
}

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(applyPepper(password), SALT_ROUNDS);
}

async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(applyPepper(password), hash);
}

// Hash de ninguém, cunhado na carga do módulo a partir de um texto aleatório
// descartado. Pelo mesmo `hashPassword` dos hashes reais, carrega o mesmo custo
// (`SALT_ROUNDS`) por construção — sem literal a manter em sincronia.
const dummyHash = hashPassword(randomBytes(32).toString("hex"));

/**
 * Gasta o custo de uma verificação de senha sem ter conta contra a qual
 * verificar (10.9). Sem isso, o login de um email desconhecido responde em
 * microssegundos e o de uma senha errada no tempo do bcrypt — e a diferença é
 * oráculo de existência de conta, anulando a indistinguibilidade de status,
 * code e mensagem. O resultado do `compare` é ignorado: a função existe para
 * gastar tempo, não para decidir.
 */
async function simulatePasswordVerification(password: string): Promise<false> {
  await verifyPassword(password, await dummyHash);
  return false;
}

export { hashPassword, simulatePasswordVerification, verifyPassword };

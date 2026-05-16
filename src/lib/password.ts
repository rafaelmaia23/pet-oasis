import bcrypt from "bcrypt";
import { env } from "@/config/env";

const SALT_ROUNDS = 12;

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

export { hashPassword, verifyPassword };

import { execSync } from "node:child_process";

// DATABASE_URL comes from .env.test (loaded by vitest.config.ts into
// process.env); these child processes inherit it — no inline prefix needed.
export default function setup() {
  execSync("prisma migrate deploy", { stdio: "inherit" });
  execSync("prisma db seed", { stdio: "inherit" });
}

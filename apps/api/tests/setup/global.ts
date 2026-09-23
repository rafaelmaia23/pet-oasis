import { execSync } from "node:child_process";
import fs from "node:fs/promises";

// DATABASE_URL comes from .env.test (loaded by vitest.config.ts into
// process.env); these child processes inherit it — no inline prefix needed.
export default function setup() {
  execSync("prisma migrate deploy", { stdio: "inherit" });
  execSync("prisma db seed", { stdio: "inherit" });

  // Teardown do diretório de upload criado pelo vitest.config.ts (9.10). Roda
  // com a suíte vermelha também — o Vitest chama o teardown de qualquer jeito —,
  // e `force` faz o caso "nenhum teste subiu arquivo" não virar erro. Um
  // SIGKILL no meio do run não roda teardown nenhum: é justamente por isso que
  // o diretório vive em `os.tmpdir()` e não no repositório.
  return async function teardown() {
    const uploadDir = process.env.UPLOAD_DIR;

    if (!uploadDir) return;

    await fs.rm(uploadDir, { recursive: true, force: true });
  };
}

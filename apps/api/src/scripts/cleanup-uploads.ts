import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { IMAGE_SIZES } from "@/lib/storage";

/**
 * Varredura de órfãos do upload (9.10). Nunca roda no ciclo request/response.
 *
 * **Órfão** é arquivo no disco que nenhuma linha do banco aponta. Ele nasce
 * quando o fluxo "grava o arquivo → insere a linha" é interrompido no meio (o
 * container morre, o deploy reinicia) e a compensação que apagaria o arquivo
 * também não corre. Não causa bug — a URL só existe se houver linha —, apenas
 * ocupa disco para sempre.
 *
 * Três decisões que valem mais que o código:
 *
 * 1. **Carência.** Um arquivo gravado há 200ms, cuja linha *está sendo inserida
 *    neste instante*, é indistinguível de um órfão. Sem carência a varredura
 *    apagaria a imagem de um upload legítimo no meio do request — o usuário
 *    recebe 201, a linha existe, o arquivo não. Bug fantasma, impossível de
 *    reproduzir. Só é candidato o arquivo mais velho que a janela.
 * 2. **A direção inversa só reporta.** Linha apontando para arquivo inexistente
 *    é sintoma de bug nosso ou de perda de disco. Apagar a linha faria o
 *    sintoma sumir levando a evidência junto; a imagem quebrada na vitrine é
 *    feia, mas é o que faz alguém investigar.
 * 3. **Sem systemd timer.** Os outros `cleanup-*` têm timer porque limpam
 *    crescimento esperado e contínuo (todo login cria sessão). Órfão de upload
 *    só nasce de falha, e agendar um evento que não deveria acontecer é ruído.
 *    O timer entra no dia em que esta varredura achar algo duas vezes.
 */

const HOUR_MS = 60 * 60 * 1000;

const log = logger.child({ module: "cleanup-uploads" });

/** Toda chave viva do banco, nas três colunas que apontam para o storage. */
async function liveKeys(): Promise<Set<string>> {
  const [images, pets, brands] = await Promise.all([
    prisma.productImage.findMany({ select: { path: true } }),
    prisma.pet.findMany({
      where: { photoPath: { not: null } },
      select: { photoPath: true },
    }),
    prisma.brand.findMany({
      where: { logoPath: { not: null } },
      select: { logoPath: true },
    }),
  ]);

  return new Set([
    ...images.map((image) => image.path),
    ...pets.map((pet) => pet.photoPath as string),
    ...brands.map((brand) => brand.logoPath as string),
  ]);
}

/** Caminhos relativos de todos os arquivos sob `root`, recursivamente. */
async function walk(root: string, prefix = ""): Promise<string[]> {
  // Anotado à mão: `ReturnType<typeof fs.readdir>` resolve para a sobrecarga
  // de `string[]`, não a de `Dirent[]` que `withFileTypes` devolve.
  let entries: Dirent[];

  try {
    entries = await fs.readdir(path.join(root, prefix), {
      withFileTypes: true,
    });
  } catch (error) {
    // Diretório ainda não existe (nenhum upload até hoje) não é falha.
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const found: string[] = [];

  for (const entry of entries) {
    const relative = path.join(prefix, entry.name);

    if (entry.isDirectory()) {
      found.push(...(await walk(root, relative)));
      continue;
    }

    found.push(relative);
  }

  return found;
}

/**
 * De `products/<id>/<uuid>-full.webp` para a chave `products/<id>/<uuid>`.
 * Arquivo que não termina num dos sufixos conhecidos devolve `null` — não é
 * nosso, e o que não reconhecemos não apagamos.
 */
function keyOf(relativePath: string): string | null {
  const normalised = relativePath.split(path.sep).join("/");

  for (const size of IMAGE_SIZES) {
    const suffix = `-${size}.webp`;

    if (normalised.endsWith(suffix)) {
      return normalised.slice(0, -suffix.length);
    }
  }

  return null;
}

export async function cleanupUploads(options: {
  dryRun: boolean;
  graceHours?: number;
}): Promise<{
  filesScanned: number;
  orphansDeleted: number;
  missingFiles: number;
  skippedUnknown: number;
  durationMs: number;
}> {
  const start = Date.now();
  const graceHours = options.graceHours ?? env.UPLOAD_ORPHAN_GRACE_HOURS;
  const cutoff = Date.now() - graceHours * HOUR_MS;
  const root = path.resolve(env.UPLOAD_DIR);

  const [keys, files] = await Promise.all([liveKeys(), walk(root)]);

  let orphansDeleted = 0;
  let skippedUnknown = 0;

  for (const relative of files) {
    const key = keyOf(relative);

    if (key === null) {
      skippedUnknown++;
      continue;
    }

    if (keys.has(key)) continue;

    const absolute = path.join(root, relative);
    const stats = await fs.stat(absolute);

    // A carência: mais novo que a janela pode ser upload em voo.
    if (stats.mtimeMs > cutoff) continue;

    orphansDeleted++;

    if (!options.dryRun) await fs.rm(absolute, { force: true });
  }

  // Direção inversa: linha viva cujo arquivo sumiu. Só reporta.
  const onDisk = new Set(files.map((file) => keyOf(file)).filter(Boolean));
  const missing = [...keys].filter((key) => !onDisk.has(key));

  for (const key of missing) {
    log.error({ key }, "row points at a file that is not on disk");
  }

  return {
    filesScanned: files.length,
    orphansDeleted,
    missingFiles: missing.length,
    skippedUnknown,
    durationMs: Date.now() - start,
  };
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const dryRun = process.argv.includes("--dry-run");

  cleanupUploads({ dryRun })
    .then((result) => {
      log.info(
        result,
        dryRun ? "cleanup-uploads dry-run" : "cleanup-uploads completed",
      );
      process.exit(0);
    })
    .catch((error: unknown) => {
      log.error({ err: error }, "cleanup-uploads failed");
      process.exit(1);
    });
}

import { pathToFileURL } from "node:url";
import { logger } from "@/lib/logger";
import { refreshSearchLexemes } from "@/modules/product/product.search.repository";

/**
 * Atualiza o dicionário de lexemas da busca (9.9/Z14).
 *
 * O dicionário é uma **view materializada**, e view materializada não se
 * atualiza sozinha. A defasagem é benigna e limitada: um produto recém-criado é
 * encontrado na hora por busca exata, sem acento e por radical — o que espera o
 * refresh é só a **correção de erro de digitação** nas palavras inéditas dele.
 *
 * Nunca roda no ciclo de request: `REFRESH` pega lock, e escrita de produto não
 * pode esperar por isso. Quem chama é o seed (`runSeed`) e, por tabela,
 * qualquer rotina que repovoe o catálogo.
 */

const log = logger.child({ module: "refresh-search-lexemes" });

export async function refreshSearchDictionary(): Promise<{
  durationMs: number;
}> {
  const start = Date.now();

  await refreshSearchLexemes();

  return { durationMs: Date.now() - start };
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  refreshSearchDictionary()
    .then((result) => {
      log.info(result, "refresh-search-lexemes completed");
      process.exit(0);
    })
    .catch((error: unknown) => {
      log.error({ err: error }, "refresh-search-lexemes failed");
      process.exit(1);
    });
}

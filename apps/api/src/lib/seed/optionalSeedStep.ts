import { logger } from "@/lib/logger";

const log = logger.child({ module: "seed" });

/**
 * O resultado de um passo opcional. `ok: false` não carrega o erro de
 * propósito: ele já foi logado aqui, e o chamador só precisa saber **que**
 * falhou — para nomear o passo no resumo do seed, não para tratá-lo.
 */
export type OptionalSeedOutcome<T> = { ok: true; value: T } | { ok: false };

/**
 * Roda um passo **opcional** do seed — dado de demonstração, atrás de flag de
 * env — em modo fail-open (10.3): a falha vira uma linha em nível de erro e o
 * seed segue para o passo seguinte, em vez de derrubar o boot.
 *
 * A fronteira é o que importa aqui, e ela é contrato: **dado de referência**
 * (features, roles, raças, léxico da busca) continua fatal, porque é
 * pré-requisito da API como a migration é — subir com a tabela de autorização
 * pela metade seria pior que não subir. **Dado de demonstração** não é: foi uma
 * falha de permissão ao gravar imagem do catálogo fake que pôs a API inteira em
 * crash loop e 502 no proxy. Passo novo no `runSeed` escolhe um dos dois lados;
 * não há terceiro.
 *
 * Mesma degradação já adotada nos destinos externos de observabilidade e no
 * audit log (`lib/auditLog.ts`): o que é acessório loga e segue.
 */
export async function runOptionalSeedStep<T>(
  step: string,
  run: () => Promise<T>,
): Promise<OptionalSeedOutcome<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    log.error({ err: error, step }, "optional seed step failed");
    return { ok: false };
  }
}

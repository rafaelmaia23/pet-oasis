import type { routes } from "@pet-oasis/api-contracts/routes";
import { prisma } from "@/lib/prisma";
import type { RouteHandler } from "@/lib/registerRoute";

/**
 * A linha única que cada `SHOW`/`SELECT` do health check devolve. Um resultado
 * vazio não tem resposta honesta — publicar o health check sem o campo seria
 * dizer que está tudo bem sem saber —, então vira 500 pelo handler de erro.
 * Fora de teste isso não acontece: numa conexão morta o `$queryRaw` já lança.
 */
function firstRow<T>(rows: T[], what: string): T {
  const row = rows[0];
  if (!row) throw new Error(`o banco respondeu sem ${what}`);
  return row;
}

export const getStatus: RouteHandler<typeof routes.status.get> = async () => {
  const updatedAt = new Date().toISOString();

  const databaseVersionResult = await prisma.$queryRaw<
    { server_version: string }[]
  >`
    SHOW server_version
  `;

  const databaseMaxConnectionsResult = await prisma.$queryRaw<
    { max_connections: string }[]
  >`
    SHOW max_connections
  `;

  const databaseOpenedConnectionsResult = await prisma.$queryRaw<
    { count: number }[]
  >`
    SELECT COUNT(*)::int FROM pg_stat_activity WHERE datname = current_database()
  `;

  return {
    updated_at: updatedAt,
    dependencies: {
      database: {
        version: firstRow(databaseVersionResult, "a versão").server_version,
        max_connections: parseInt(
          firstRow(databaseMaxConnectionsResult, "o teto de conexões")
            .max_connections,
          10,
        ),
        opened_connections: firstRow(
          databaseOpenedConnectionsResult,
          "as conexões abertas",
        ).count,
      },
    },
  };
};

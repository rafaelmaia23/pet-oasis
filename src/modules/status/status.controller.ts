import type { Request, Response } from "express";
import { prisma } from "@/lib/prisma";

export const getStatus = async (_req: Request, res: Response) => {
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

  const databaseVersion = databaseVersionResult[0]?.server_version;
  const databaseMaxConnections =
    databaseMaxConnectionsResult[0]?.max_connections;
  const databaseOpenedConnections = databaseOpenedConnectionsResult[0]?.count;

  res.status(200).json({
    updated_at: updatedAt,
    dependencies: {
      database: {
        version: databaseVersion,
        max_connections: parseInt(databaseMaxConnections ?? "0", 10),
        opened_connections: databaseOpenedConnections,
      },
    },
  });
};

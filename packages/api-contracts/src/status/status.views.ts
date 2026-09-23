import { z } from "zod";

// O health check (`GET /status`): a hora da leitura e o que a API sabe do
// banco. É público e não toca em regra de domínio — o que interessa ao cliente
// é a resposta ter chegado; os números são para quem opera.
const defaultView = z
  .object({
    updated_at: z.string().meta({ example: "2026-01-15T12:00:00.000Z" }),
    dependencies: z.object({
      database: z.object({
        version: z.string().meta({ example: "16.14" }),
        max_connections: z.number().meta({ example: 100 }),
        opened_connections: z.number().meta({ example: 1 }),
      }),
    }),
  })
  .meta({ id: "Status" });

export const statusViews = { default: defaultView } as const;

export type StatusView = keyof typeof statusViews;

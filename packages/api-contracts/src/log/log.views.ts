import { z } from "zod";

// As linhas do buffer em memória são objetos heterogêneos (já redigidos pelo
// pino), então a view é genérica de propósito: prometer campos aqui seria
// prometer o formato do logger. O `meta` declara as limitações do ring buffer
// — por processo e volátil —, que é o que o cliente precisa saber para não
// tratar isto como trilha de auditoria.
const defaultView = z
  .object({
    data: z.array(z.record(z.string(), z.unknown())),
    meta: z.object({
      count: z.number().int(),
      capacity: z.number().int(),
      perProcess: z.literal(true),
      volatile: z.literal(true),
    }),
  })
  .meta({ id: "RecentLogs", description: "Fatia recente do ring buffer" });

export const recentLogsViews = { default: defaultView } as const;

export type RecentLogsView = keyof typeof recentLogsViews;

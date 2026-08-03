import { z } from "zod";
import { createPresenter } from "@/utils/presenter";

const defaultView = z
  .object({
    id: z.uuid(),
    device: z.string().meta({ example: "Chrome no Windows" }),
    ipAddress: z.string().nullable().meta({ example: "203.0.113.42" }),
    createdAt: z.coerce.date(),
    expiresAt: z.coerce.date(),
    current: z
      .boolean()
      .meta({ description: "Se é a sessão da própria request atual" }),
  })
  .meta({
    id: "Session",
    description: "Sessão viva do usuário (uma linha por refresh token emitido)",
  });

export const sessionViews = { default: defaultView } as const;

export type SessionView = keyof typeof sessionViews;

export const sessionPresenter = createPresenter(sessionViews);

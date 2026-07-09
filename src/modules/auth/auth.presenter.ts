import { z } from "zod";
import { createPresenter } from "@/utils/presenter";

const defaultView = z
  .object({
    id: z.uuid(),
    createdAt: z.coerce.date(),
    expiresAt: z.coerce.date(),
    userAgent: z.string().nullable().meta({ example: "Mozilla/5.0" }),
    ipAddress: z.string().nullable().meta({ example: "203.0.113.42" }),
  })
  .meta({
    id: "Session",
    description: "Sessão viva do usuário (uma linha por refresh token emitido)",
  });

export const sessionViews = { default: defaultView } as const;

export type SessionView = keyof typeof sessionViews;

export const sessionPresenter = createPresenter(sessionViews);

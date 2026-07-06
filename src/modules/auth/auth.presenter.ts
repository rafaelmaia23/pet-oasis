import { z } from "zod";
import { createPresenter } from "@/utils/presenter";

const defaultView = z.object({
  id: z.uuid(),
  createdAt: z.coerce.date(),
  expiresAt: z.coerce.date(),
  userAgent: z.string().nullable(),
  ipAddress: z.string().nullable(),
});

export const sessionViews = { default: defaultView } as const;

export type SessionView = keyof typeof sessionViews;

export const sessionPresenter = createPresenter(sessionViews);

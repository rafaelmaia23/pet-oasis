import z from "zod";
import { ProfileKind } from "@/generated/prisma/enums";
import { createPresenter } from "@/utils/presenter";

const defaultView = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  appliesTo: z.enum(ProfileKind).nullable(),
  features: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      description: z.string(),
    }),
  ),
});

export const roleViews = { default: defaultView } as const;

export type RoleView = keyof typeof roleViews;

export const rolePresenter = createPresenter(roleViews);

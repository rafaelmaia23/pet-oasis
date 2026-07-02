import { z } from "zod";
import { ProfileKind } from "@/generated/prisma/enums";
import { createPresenter } from "@/utils/presenter";

const roleSummaryView = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  appliesTo: z.enum(ProfileKind).nullable(),
});

const defaultView = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  cpf: z.string(),
  customer: z
    .object({
      phone: z.string(),
      address: z.string().nullable(),
      birthDate: z.coerce.date().nullable(),
      roles: z.array(roleSummaryView),
    })
    .nullable(),
  employee: z
    .object({
      hiringDate: z.coerce.date(),
      roles: z.array(roleSummaryView),
    })
    .nullable(),
  features: z.array(z.string()),
});

export const meViews = { default: defaultView } as const;

export type MeView = keyof typeof meViews;

export const mePresenter = createPresenter(meViews);

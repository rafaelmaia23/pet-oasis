import { z } from "zod";
import { createPresenter } from "@/utils/presenter";

const defaultView = z.object({
  id: z.uuid(),
  name: z.string(),
});

const ownerView = defaultView.extend({
  email: z.email(),
  cpf: z.string(),
  customer: z
    .object({
      phone: z.string(),
      address: z.string().nullable(),
      birthDate: z.coerce.date().nullable(),
    })
    .nullable(),
  employee: z
    .object({
      hiringDate: z.coerce.date(),
    })
    .nullable(),
});

const adminView = ownerView.extend({
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  roles: z.array(
    z.object({
      role: z.object({
        id: z.uuid(),
        name: z.string(),
      }),
    }),
  ),
  features: z.array(
    z.object({
      granted: z.boolean(),
      grantedAt: z.coerce.date(),
      feature: z.object({
        id: z.uuid(),
        name: z.string(),
      }),
    }),
  ),
});

export const userViews = {
  default: defaultView,
  owner: ownerView,
  admin: adminView,
} as const;

export type UserView = keyof typeof userViews;

export const userPresenter = createPresenter(userViews);

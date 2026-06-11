import { z } from "zod";
import { createPresenter } from "@/utils/presenter";

const ownerView = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
});

const adminView = ownerView.extend({
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  features: z.array(
    z.object({
      granted: z.boolean(),
      feature: z.object({
        id: z.uuid(),
        name: z.string(),
        description: z.string().nullable(),
      }),
    }),
  ),
});

export const userViews = { owner: ownerView, admin: adminView } as const;
export type UserView = keyof typeof userViews;

export const userPresenter = createPresenter(userViews);

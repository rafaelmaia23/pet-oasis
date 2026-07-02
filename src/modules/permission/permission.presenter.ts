import { z } from "zod";
import { createPresenter } from "@/utils/presenter";

const userFeatureDefaultView = z.object({
  granted: z.boolean(),
  grantedAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  feature: z.object({
    id: z.uuid(),
    name: z.string(),
    description: z.string(),
  }),
});

export const userFeatureViews = { default: userFeatureDefaultView } as const;

export type UserFeatureView = keyof typeof userFeatureViews;

export const userFeaturePresenter = createPresenter(userFeatureViews);

const effectiveFeaturesDefaultView = z.array(z.string());

export const effectiveFeaturesViews = {
  default: effectiveFeaturesDefaultView,
} as const;

export type EffectiveFeaturesView = keyof typeof effectiveFeaturesViews;

export const effectiveFeaturesPresenter = createPresenter(
  effectiveFeaturesViews,
);

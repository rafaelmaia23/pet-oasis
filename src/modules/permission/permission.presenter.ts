import { z } from "zod";
import { createPresenter } from "@/utils/presenter";

const userFeatureDefaultView = z
  .object({
    granted: z.boolean(),
    grantedAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    feature: z.object({
      id: z.uuid(),
      name: z.string().meta({ example: "manage:permission" }),
      description: z.string(),
    }),
  })
  .meta({
    id: "UserFeatureOverride",
    description: "Override de feature de um usuário (grant/deny)",
  });

export const userFeatureViews = { default: userFeatureDefaultView } as const;

export type UserFeatureView = keyof typeof userFeatureViews;

export const userFeaturePresenter = createPresenter(userFeatureViews);

const effectiveFeaturesDefaultView = z.array(z.string()).meta({
  id: "EffectiveFeatures",
  description: "Lista plana das features efetivas de um usuário",
  example: ["read:user", "update:user", "read:session"],
});

export const effectiveFeaturesViews = {
  default: effectiveFeaturesDefaultView,
} as const;

export type EffectiveFeaturesView = keyof typeof effectiveFeaturesViews;

export const effectiveFeaturesPresenter = createPresenter(
  effectiveFeaturesViews,
);

import { z } from "zod";
import { featureNameSchema } from "../feature/feature.names";

const userFeatureDefaultView = z
  .object({
    granted: z.boolean(),
    grantedAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    // A role a que o override pertence (D2): sem ela a lista não diz sobre
    // qual atribuição o ajuste incide, e é essa a informação nova do modelo.
    role: z.object({
      id: z.uuid(),
      name: z.string().meta({ example: "manager" }),
    }),
    feature: z.object({
      id: z.uuid(),
      name: featureNameSchema.meta({ example: "manage:permission" }),
      description: z.string(),
    }),
  })
  .meta({
    id: "UserFeatureOverride",
    description:
      "Override de feature escopado a uma atribuição de role (grant/deny)",
  });

export const userFeatureViews = { default: userFeatureDefaultView } as const;

export type UserFeatureView = keyof typeof userFeatureViews;

const effectiveFeaturesDefaultView = z.array(featureNameSchema).meta({
  id: "EffectiveFeatures",
  description: "Lista plana das features efetivas de um usuário",
  example: ["read:user", "update:user", "read:session"],
});

export const effectiveFeaturesViews = {
  default: effectiveFeaturesDefaultView,
} as const;

export type EffectiveFeaturesView = keyof typeof effectiveFeaturesViews;

import { z } from "zod";
import { featureNameSchema } from "./feature.names";

const defaultView = z
  .object({
    id: z.uuid(),
    name: featureNameSchema.meta({ example: "read:user" }),
    description: z.string().meta({ example: "Ver o próprio perfil" }),
  })
  .meta({
    id: "Feature",
    description: "Feature (capacidade) do sistema",
  });

export const featureViews = {
  default: defaultView,
} as const;

export type FeatureView = keyof typeof featureViews;

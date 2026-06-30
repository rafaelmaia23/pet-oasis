import { z } from "zod";
import { createPresenter } from "@/utils/presenter";

const defaultView = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
});

export const featureViews = {
  default: defaultView,
} as const;

export type FeatureView = keyof typeof featureViews;

export const featurePresenter = createPresenter(featureViews);

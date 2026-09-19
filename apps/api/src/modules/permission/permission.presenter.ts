import {
  effectiveFeaturesViews,
  userFeatureViews,
} from "@pet-oasis/api-contracts/permission";
import { createPresenter } from "@/utils/presenter";

export const userFeaturePresenter = createPresenter(userFeatureViews);

export const effectiveFeaturesPresenter = createPresenter(
  effectiveFeaturesViews,
);

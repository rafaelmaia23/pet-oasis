import { createNotFoundError } from "@/errors";
import * as featureRepository from "./feature.repository";

export async function getAllFeatures() {
  return featureRepository.findAllFeatures();
}

export async function getFeatureById(id: string) {
  const feature = await featureRepository.findFeatureById(id);

  if (!feature) {
    throw createNotFoundError({
      message: "Feature não encontrada",
      action: "Verifique o ID e tente novamente",
    });
  }

  return feature;
}

import { createNotFoundError } from "@/errors";
import { resolveSlug } from "@/modules/catalog/catalog.slug";
import * as tagRepository from "./tag.repository";
import type { CreateTagInput, UpdateTagInput } from "./tag.schema";

async function resolveTag(tagId: string) {
  const tag = await tagRepository.findTagById(tagId);

  if (!tag) {
    throw createNotFoundError({
      message: "Tag não encontrada",
      action: "Verifique o ID e tente novamente",
    });
  }

  return tag;
}

export async function getTags() {
  return tagRepository.findAllTags();
}

export async function createTag(input: CreateTagInput) {
  const { slug, ...rest } = input;

  return tagRepository.createTag(
    { ...rest, slug: resolveSlug(input.name, slug) },
    { action: "TAG_CREATED", targetType: "Tag" },
  );
}

/** Slug congelado no rename, como em marca e categoria (9.6/W4). */
export async function updateTag(tagId: string, input: UpdateTagInput) {
  await resolveTag(tagId);

  return tagRepository.updateTag(tagId, input, {
    action: "TAG_UPDATED",
    targetType: "Tag",
    targetId: tagId,
    metadata: { fields: Object.keys(input) },
  });
}

export async function deleteTag(tagId: string) {
  await resolveTag(tagId);

  await tagRepository.deleteTag(tagId, {
    action: "TAG_DELETED",
    targetType: "Tag",
    targetId: tagId,
  });
}

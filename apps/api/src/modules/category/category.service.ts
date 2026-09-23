import type {
  CreateCategoryInput,
  UpdateCategoryInput,
} from "@pet-oasis/api-contracts/catalog";
import {
  createConflictError,
  createNotFoundError,
  createValidationError,
} from "@/errors";
import { resolveSlug } from "@/modules/catalog/catalog.slug";
import * as categoryRepository from "./category.repository";
import {
  buildTree,
  type CategoryNode,
  depthOf,
  heightOf,
  isInSubtreeOf,
} from "./category.tree";

/**
 * Três níveis (9.6/W1): `Alimentação > Ração > Ração seca`. O teto não cabe no
 * banco — nenhuma constraint expressa "profundidade" —, então mora aqui, e é
 * checado nas duas escritas que podem violá-lo: criar com pai e re-parentar.
 */
const MAX_DEPTH = 3;

const invalidParent = (message: string) =>
  createValidationError({ errors: { parentId: [message] } });

async function resolveCategory(categoryId: string) {
  const category = await categoryRepository.findCategoryById(categoryId);

  if (!category) {
    throw createNotFoundError({
      message: "Categoria não encontrada",
      action: "Verifique o ID e tente novamente",
    });
  }

  return category;
}

/**
 * Valida o pai pedido contra a árvore ativa inteira.
 *
 * `movingId` só vem no re-parenting, e é o que separa os dois casos: criar
 * pendura uma folha nova (altura 1), mover pendura uma **subárvore**, que pode
 * estourar o limite mesmo quando o nó sozinho caberia. É também o que permite
 * recusar o ciclo — pendurar um nó em alguém que está abaixo dele.
 */
function assertParentIsValid(
  nodes: CategoryNode[],
  parentId: string,
  movingId?: string,
) {
  if (!nodes.some((node) => node.id === parentId)) {
    throw invalidParent("Categoria pai não encontrada");
  }

  if (movingId && isInSubtreeOf(nodes, parentId, movingId)) {
    throw invalidParent(
      "A categoria não pode ser filha dela mesma nem de uma de suas descendentes",
    );
  }

  const subtreeHeight = movingId ? heightOf(nodes, movingId) : 1;

  if (depthOf(nodes, parentId) + subtreeHeight > MAX_DEPTH) {
    throw invalidParent(
      `A árvore de categorias tem no máximo ${MAX_DEPTH} níveis`,
    );
  }
}

export async function getCategoryTree() {
  const categories = await categoryRepository.findAllCategories();

  return buildTree(categories);
}

export async function createCategory(input: CreateCategoryInput) {
  const { slug, description, parentId, position, ...rest } = input;

  if (parentId) {
    assertParentIsValid(await categoryRepository.findAllCategories(), parentId);
  }

  return categoryRepository.createCategory(
    {
      ...rest,
      slug: resolveSlug(input.name, slug),
      ...(description === undefined ? {} : { description }),
      ...(parentId === undefined ? {} : { parentId }),
      ...(position === undefined ? {} : { position }),
    },
    {
      action: "CATEGORY_CREATED",
      targetType: "Category",
      ...(parentId ? { metadata: { parentId } } : {}),
    },
  );
}

/**
 * O slug **não** é re-derivado quando o nome muda (9.6/W4). `parentId: null` é
 * pedido explícito de promover o nó à raiz — sempre cabe, porque encurtar um
 * ramo nunca estoura a profundidade.
 */
export async function updateCategory(
  categoryId: string,
  input: UpdateCategoryInput,
) {
  await resolveCategory(categoryId);

  if (input.parentId) {
    assertParentIsValid(
      await categoryRepository.findAllCategories(),
      input.parentId,
      categoryId,
    );
  }

  return categoryRepository.updateCategory(categoryId, input, {
    action: "CATEGORY_UPDATED",
    targetType: "Category",
    targetId: categoryId,
    metadata: { fields: Object.keys(input) },
  });
}

/**
 * Recusa a exclusão de categoria com filha ativa **ou com produto ativo
 * vinculado** (9.6/W3, completado na 9.7) — sem cascata e sem reparenting:
 * apagar um pai não pode sumir com uma subárvore inteira sem o staff perceber,
 * nem mudar em silêncio o significado de categorias que ele não tocou. O staff
 * move ou apaga as filhas primeiro.
 *
 * Desvincular os produtos automaticamente está fora de questão: violaria o
 * mínimo de uma categoria por produto (9.7/X7), então a saída é movê-los. O
 * vínculo de produto **excluído** não segura nada — o filtro conta só ativo.
 */
export async function deleteCategory(categoryId: string) {
  await resolveCategory(categoryId);

  const activeChildren =
    await categoryRepository.countActiveChildren(categoryId);

  if (activeChildren > 0) {
    throw createConflictError({
      message: "A categoria ainda tem subcategorias ativas",
      action: "Mova ou exclua as subcategorias antes de excluir esta",
    });
  }

  const activeProducts =
    await categoryRepository.countActiveProducts(categoryId);

  if (activeProducts > 0) {
    throw createConflictError({
      message: "A categoria ainda tem produtos vinculados",
      action: "Mova os produtos para outra categoria antes de excluir esta",
    });
  }

  await categoryRepository.softDeleteCategory(categoryId, {
    action: "CATEGORY_DELETED",
    targetType: "Category",
    targetId: categoryId,
  });
}

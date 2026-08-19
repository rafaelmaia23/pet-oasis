import { z } from "zod";
import { createPresenter } from "@/utils/presenter";

/**
 * View **recursiva**: `GET /categories` devolve a árvore aninhada (9.6/W7), não
 * a lista plana, porque árvore não é paginável e a vitrine monta o menu inteiro
 * com uma chamada. O getter de `children` é a forma que o Zod 4 usa para tipos
 * recursivos — a whitelist do presenter continua valendo em cada nível, então
 * um campo novo no model não vaza pelos filhos.
 */
const defaultView = z
  .object({
    id: z.uuid(),
    name: z.string().meta({ example: "Ração seca" }),
    slug: z.string().meta({ example: "racao-seca" }),
    description: z.string().nullable(),
    parentId: z.uuid().nullable(),
    position: z.int().meta({ example: 0 }),
    get children() {
      return z.array(defaultView);
    },
  })
  .meta({
    id: "Category",
    description: "Categoria do catálogo, com as filhas aninhadas",
  });

export const categoryViews = {
  default: defaultView,
} as const;

export type CategoryView = keyof typeof categoryViews;

export const categoryPresenter = createPresenter(categoryViews);

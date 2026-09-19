import { z } from "zod";

// View única, como a de marca: taxonomia aparece inteira na view pública do
// produto, então não há campo a cortar por feature efetiva.
const defaultView = z
  .object({
    id: z.uuid(),
    name: z.string().meta({ example: "Promoção" }),
    slug: z.string().meta({ example: "promocao" }),
  })
  .meta({
    id: "Tag",
    description:
      "Rótulo transversal de produto (promoção, filhote, lançamento)",
  });

export const tagViews = {
  default: defaultView,
} as const;

export type TagView = keyof typeof tagViews;

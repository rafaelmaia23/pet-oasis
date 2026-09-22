import { z } from "zod";
import { cursorMetaSchema, offsetMetaSchema } from "./pagination.schema";

/**
 * O envelope `{ data, meta }` das listagens. Uma variante por estratégia de
 * paginação, mais a das listas que não paginam — o `meta {}` existe para que
 * toda listagem tenha a **mesma forma**, e o cliente não precise saber de
 * antemão qual delas pagina.
 *
 * Mora no contrato, e não na API, porque é o shape que atravessa a rede: a
 * tabela de rotas monta a resposta de cada listagem com um destes.
 */

const emptyMetaSchema = z
  .object({})
  .meta({ id: "EmptyMeta", description: "Sem metadados de paginação" });

/** `?page=&limit=` — ganha `total` e salto para página arbitrária. */
export function offsetList(view: z.ZodType) {
  return z.object({ data: z.array(view), meta: offsetMetaSchema });
}

/** `?cursor=&limit=` — sem `total`, nunca pula nem repete registro. */
export function cursorList(view: z.ZodType) {
  return z.object({ data: z.array(view), meta: cursorMetaSchema });
}

/** Coleção pequena e fechada (taxonomia, catálogo semeado): `meta` vazio. */
export function staticList(view: z.ZodType) {
  return z.object({ data: z.array(view), meta: emptyMetaSchema });
}

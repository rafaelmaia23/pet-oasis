import { z } from "zod";
import { createValidationError } from "@/errors";
import { slugify } from "@/utils/slugify";

/**
 * A regra de forma de nome, slug e descrição da taxonomia é contrato
 * (`@pet-oasis/api-contracts/catalog`): `catalogNameSchema`, `slugSchema` e
 * `catalogDescriptionSchema` valem igual para marca, categoria, tag e produto.
 * O que fica aqui é o que precisa de helper de servidor — a derivação do slug
 * a partir do nome, que usa `slugify` e lança o 422 da API.
 *
 * Este arquivo é o único do diretório `catalog/`: não há rota, controller nem
 * repositório aqui, porque não existe recurso "catálogo" — existe a regra que
 * os recursos dividem.
 */

/**
 * Decide o slug que vai ao banco: o explícito vence, o derivado do nome é o
 * caminho comum (9.6/W4).
 *
 * Devolver vazio não é opção — o slug é a URL pública. Um nome só de símbolos
 * ("!!!") slugifica para nada, e o erro sai nomeando **`name`**, que é o campo
 * que o staff realmente mandou; culpar `slug` mandaria consertar um campo que
 * ele nem enviou.
 *
 * A recusa de slug com forma de uuid (Y2) vale para os **dois** caminhos: o
 * `slugSchema` cobre o explícito, e aqui se cobre o derivado. Um nome como
 * "3f2504e0 4f89 41d3 9a0c 0305e82c3301" slugifica para algo que
 * `GET /products/:idOrSlug` leria como id — o produto nasceria inalcançável
 * por slug, e a leitura não tem como consertar o que já está no banco.
 */
export function resolveSlug(name: string, slug?: string): string {
  if (slug) return slug;

  const derived = slugify(name);

  if (!derived) {
    throw createValidationError({
      errors: {
        name: [
          "O nome não produz um slug utilizável; informe o campo slug explicitamente",
        ],
      },
    });
  }

  if (z.uuid().safeParse(derived).success) {
    throw createValidationError({
      errors: {
        name: [
          "O nome produz um slug com forma de UUID; informe o campo slug explicitamente",
        ],
      },
    });
  }

  return derived;
}

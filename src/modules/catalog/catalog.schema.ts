import { z } from "zod";
import { createValidationError } from "@/errors";
import { slugify } from "@/utils/slugify";

/**
 * Peças compartilhadas pelos três módulos de taxonomia do catálogo (9.6):
 * `brand`, `category` e `tag`. Nome e slug seguem exatamente a mesma regra nos
 * três — mantê-la em um lugar só é o que impede as três de divergirem em
 * silêncio quando `Product` reaplicar a mesma decisão na 9.7.
 *
 * Este arquivo é o único do diretório `catalog/`: não há rota, controller nem
 * repositório aqui, porque não existe recurso "catálogo" — existe a regra que
 * os três recursos dividem.
 */

export const catalogNameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(80, "Name must be at most 80 characters")
  .meta({ example: "Ração Golden" });

/**
 * Formato do slug já normalizado: minúsculas, dígitos e hífen simples entre
 * palavras. É o mesmo formato que `slugify` produz — quem manda o slug
 * explícito precisa mandar um que o gerador também produziria, senão a URL
 * pública teria duas gramáticas.
 */
export const slugSchema = z
  .string()
  .trim()
  .max(80, "Slug must be at most 80 characters")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Slug must contain only lowercase letters, digits and single hyphens",
  )
  // Um uuid em minúsculas **casa** com o regex acima (hex e hífens simples), e
  // `GET /products/:idOrSlug` decide id × slug pela forma do valor (9.8/Y2).
  // Recusar aqui é o que impede a rota de nascer ambígua: a leitura não teria
  // como desempatar um slug já gravado com cara de id.
  .refine((slug) => !z.uuid().safeParse(slug).success, {
    error: "Slug cannot be shaped like a UUID",
  })
  .meta({ example: "racao-golden" });

export const catalogDescriptionSchema = z
  .string()
  .trim()
  .max(500, "Description must be at most 500 characters")
  .meta({ example: "Marca premium de alimentos para cães e gatos." });

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

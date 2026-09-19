import { z } from "zod";

/**
 * Peças compartilhadas pelos módulos de taxonomia do catálogo (9.6) — `brand`,
 * `category` e `tag` — e reaplicadas por `product` (9.7). Nome e slug seguem
 * exatamente a mesma regra em todos: mantê-la em um lugar só é o que impede os
 * recursos de divergirem em silêncio.
 */

export const catalogNameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(80, "Name must be at most 80 characters")
  .meta({ example: "Ração Golden" });

/**
 * Formato do slug já normalizado: minúsculas, dígitos e hífen simples entre
 * palavras. É o mesmo formato que o `slugify` da API produz — quem manda o slug
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

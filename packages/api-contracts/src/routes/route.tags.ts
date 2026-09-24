/**
 * Os grupos da referência, na ordem em que aparecem — a mesma ordem dos
 * domínios da tabela, que é a ordem da sidebar do `/openapi.json`.
 *
 * A tag de uma rota sai daqui e a prosa que descreve cada grupo fica no
 * documento da API (`apps/api/src/docs/openapi.ts`), que declara uma descrição
 * por tag desta lista — e só por tag desta lista. É essa a amarra dos dois
 * sentidos: `tests/route-table.test.ts` prova que a tabela não usa tag fora
 * desta lista nem deixa uma sem uso, e o typecheck da API prova que o
 * documento descreve exatamente estas.
 */
export const ROUTE_TAGS = [
  "Status",
  "Auth",
  "Me",
  "Users",
  "Profiles",
  "Permissions",
  "Roles",
  "Features",
  "Breeds",
  "Brands",
  "Categories",
  "Tags",
  "Products",
  "Variants",
  "Pets",
  "Audit",
  "Logs",
] as const;

export type RouteTag = (typeof ROUTE_TAGS)[number];

/**
 * Deriva o slug de um nome — a forma que vai para a URL pública do catálogo.
 *
 * O slug é gerado **uma vez**, na criação, e congelado depois (9.6/W4): renomear
 * a marca ou a categoria não muda a URL, senão uma correção de digitação
 * quebraria todo link externo e a indexação. Quem quiser controlar manda o
 * `slug` explícito no corpo — este util só cobre o caminho comum.
 *
 * O `normalize("NFD")` separa a letra do acento e o `replace` seguinte apaga só
 * os diacríticos combinantes: é isso que faz "Ração" virar `racao` em vez de
 * `ra-c-ao`. Devolve string vazia quando não sobra nada aproveitável (um nome só
 * de símbolos) — o caller decide, e no catálogo isso vira 422.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

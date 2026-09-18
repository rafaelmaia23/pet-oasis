/**
 * Remove as chaves cujo valor é `undefined`.
 *
 * Existe por causa do `exactOptionalPropertyTypes` do tsconfig, que distingue
 * "chave ausente" de "chave presente valendo `undefined`" — e as duas pontas do
 * projeto discordam justamente aí: o Zod infere `campo?: T | undefined`, o
 * Prisma aceita só `campo?: T`. Um `PATCH` com dez campos opcionais viraria dez
 * spreads condicionais (`...(x !== undefined && { x })`) escritos à mão, que é
 * o idioma usado onde os campos são dois ou três.
 *
 * O `as` é o preço de expressar em tipos algo que o TypeScript não deriva de
 * `Object.entries` (que perde os literais das chaves). Fica confinado aqui, no
 * único lugar em que a conversão é feita.
 */
export function definedOnly<T extends object>(
  input: T,
): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as { [K in keyof T]?: Exclude<T[K], undefined> };
}

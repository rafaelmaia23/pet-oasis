/**
 * Teto de imagens por produto. Constante e não env var (9.10/AA19): "um produto
 * tem no máximo 8 imagens" não muda entre dev e produção — é regra de domínio,
 * e regra que mora em env é regra que ninguém acha lendo o domínio.
 *
 * É também o limite estrutural do crescimento de disco, mais forte que qualquer
 * rate limit: o número de arquivos é no máximo 8 × produtos, e produto só nasce
 * pelas mãos de quem tem `manage:product`.
 */
export const MAX_IMAGES_PER_PRODUCT = 8;

import { refreshSearchLexemes } from "@/modules/product/product.search.repository";

/**
 * O dicionário de lexemas da busca é uma **view materializada** (9.9/Z14): ela
 * não enxerga um produto criado depois do último refresh. Todo teste que depende
 * de **correção de erro de digitação** precisa chamar isto depois de semear.
 *
 * O que não depende: busca exata, sem acento e por radical, que leem as colunas
 * geradas e estão sempre atualizadas — e que, desde a revisão da 9.9, é o que a
 * busca tenta **primeiro**: a correção só entra quando a busca literal não acha
 * nada. Por isso esquecer a chamada tira a tolerância a erro de digitação do
 * teste, e não os resultados dele.
 *
 * O `clearDatabase` esvazia este dicionário no teardown, então nenhuma palavra
 * atravessa de um arquivo de teste para o outro.
 */
export async function refreshSearchDictionary() {
  await refreshSearchLexemes();
}

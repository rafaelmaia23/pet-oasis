import { createHash } from "node:crypto";
import { en, Faker } from "@faker-js/faker";

/**
 * `faker` determinístico **por chave**, e não por posição no array (9.11/AB13).
 *
 * A instância é própria, nunca o singleton `faker` compartilhado com os testes:
 * semear com seed fixo mudaria o stream de valores que os testes consomem do
 * global em outros arquivos.
 *
 * O detalhe que importa é o *por chave*. Uma instância semeada uma vez e
 * consumida em laço é uma **sequência**: inserir uma entrada no meio do roster
 * desloca todo o resto, e nome/telefone/preço de tudo que vem depois muda. A
 * idempotência não quebra (a chave é o email ou o slug), mas os valores
 * divergem entre um banco antigo e um recriado, e o roster passa a ter uma
 * ordem que importa por acidente do gerador. Resemeando a partir de uma chave
 * estável, o roster volta a ser um **conjunto**: reordenável e extensível para
 * sempre, o que importa porque a 9.11 não é a última sessão que vai apender a
 * ele.
 *
 * Devolve a mesma instância a cada chamada, resemeada — consuma os valores
 * antes de pedir a próxima chave.
 */
const seedFakerInstance = new Faker({ locale: [en] });

/** Inteiro estável derivado da chave: os 4 primeiros bytes do SHA-256. */
export function stableSeed(key: string): number {
  return createHash("sha256").update(key).digest().readUInt32BE(0);
}

export function seededFaker(key: string): Faker {
  seedFakerInstance.seed(stableSeed(key));

  return seedFakerInstance;
}

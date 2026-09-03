/**
 * Gera `src/lib/seed/fakeImages.constants.ts` a partir de `assets-inbox/`.
 *
 * Por que base64 num `.ts` e não `.webp` versionado (9.11/AB1): o estágio
 * `runtime` do `Dockerfile` copia `node_modules`, `dist`, `prisma` e o
 * entrypoint — nunca `src/` —, e o tsup empacota TS/JS ignorando `.webp`. O
 * seed roda a cada boot do container (`migrate deploy → seed → start`), então
 * um asset em disco simplesmente não existiria lá. Base64 num módulo é o único
 * caminho que sobrevive ao bundle sem inventar um segundo mecanismo de deploy.
 *
 * Roda uma vez, à mão, quando o acervo de `assets-inbox/` muda:
 *
 *     npx tsx tools/generate-fake-images.ts
 *
 * Não há script no `package.json` de propósito: regenerar é evento raro (o
 * acervo é estável), e script para algo que não se repete é ruído.
 *
 * O mapeamento abaixo é explícito, e não derivado do nome do arquivo, por dois
 * motivos: alguns originais vieram com typo (`shaapoo`, `shaampo`) e o código
 * não deve herdá-lo; e o acervo tem 76 arquivos para 51 chaves, então a
 * seleção — a de maior resolução dentro de cada folha da árvore — precisa
 * ficar registrada em algum lugar legível.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";

const INBOX = resolve(import.meta.dirname, "..", "assets-inbox");
const OUTPUT = resolve(
  import.meta.dirname,
  "..",
  "src",
  "lib",
  "seed",
  "fakeImages.constants.ts",
);

/** WebP a q75 (AB12); o lado maior segue o `full` do dono em `IMAGE_DIMENSIONS`. */
const QUALITY = 75;

type AssetSpec = { key: string; file: string; maxSide: number };

/**
 * Logos das marcas (AB11). `IMAGE_DIMENSIONS.brands.full` é 512, então
 * normalizar acima disso só engordaria o arquivo.
 */
const LOGOS: AssetSpec[] = [
  { key: "brand-golden", file: "logos/logo-golden.png", maxSide: 512 },
  { key: "brand-whiskas", file: "logos/logo-whiskas.png", maxSide: 512 },
  { key: "brand-pedigree", file: "logos/logo-pedigree.png", maxSide: 512 },
  { key: "brand-sanol", file: "logos/logo-Sanol.png", maxSide: 512 },
  { key: "brand-bravecto", file: "logos/logo-bravecto.png", maxSide: 512 },
  { key: "brand-vetnil", file: "logos/logo-Vetnil.jpg", maxSide: 512 },
  { key: "brand-chalesco", file: "logos/logo-chalesco.jpg", maxSide: 512 },
  { key: "brand-jambo", file: "logos/logo-jambo.png", maxSide: 512 },
  {
    key: "brand-furacao-pet",
    file: "logos/logo-furacao-pet.jpg",
    maxSide: 512,
  },
];

/**
 * Fotos de pet. `cao-2.jpg` (246×205) e `gato-2.jpg` (250×334) ficaram fora:
 * são pequenas até para o padrão de pet (`full` 800 / `thumb` 200).
 */
const PETS: AssetSpec[] = [
  { key: "pet-cao-1", file: "pets/cao.jpg", maxSide: 800 },
  { key: "pet-cao-2", file: "pets/cao-3.jpg", maxSide: 800 },
  { key: "pet-gato-1", file: "pets/gato.jpg", maxSide: 800 },
  { key: "pet-gato-2", file: "pets/gato-3.jpg", maxSide: 800 },
  { key: "pet-coelho", file: "pets/coelho.jpg", maxSide: 800 },
  { key: "pet-hamster", file: "pets/hamster.jpg", maxSide: 800 },
];

/**
 * Fotos de produto, agrupadas pela folha da árvore de categorias. Uma por
 * produto (AB12) — nenhuma repete —, mais duas extras em `racao-seca-cao` para
 * o produto que carrega a galeria de 3.
 */
const PRODUCTS: AssetSpec[] = [
  // Alimentação > Ração > Ração seca — 8 chaves para 6 produtos (uma galeria).
  {
    key: "racao-seca-cao-1",
    file: "produtos/racao-seca-cao-1.png",
    maxSide: 800,
  },
  { key: "racao-seca-cao-2", file: "produtos/racao-seca-4.jpg", maxSide: 800 },
  { key: "racao-seca-cao-3", file: "produtos/racao-seca-5.jpg", maxSide: 800 },
  {
    key: "racao-seca-cao-4",
    file: "produtos/racao-seca-cao-2.jpg",
    maxSide: 800,
  },
  {
    key: "racao-seca-cao-5",
    file: "produtos/racao-seca-cao-3.png",
    maxSide: 800,
  },
  {
    key: "racao-seca-gato-1",
    file: "produtos/racao-seca-gato-1.jpg",
    maxSide: 800,
  },
  {
    key: "racao-seca-gato-2",
    file: "produtos/racao-seca-gato-2.jpg",
    maxSide: 800,
  },
  {
    key: "racao-seca-gato-3",
    file: "produtos/racao-seca-gato-3.jpg",
    maxSide: 800,
  },
  // Alimentação > Ração > Ração úmida
  { key: "racao-umida-1", file: "produtos/racao-humida.jpg", maxSide: 800 },
  { key: "racao-umida-2", file: "produtos/racao-humida-1.jpg", maxSide: 800 },
  { key: "racao-umida-3", file: "produtos/racao-humida-2.jpg", maxSide: 800 },
  // Alimentação > Petiscos
  { key: "petisco-1", file: "produtos/petisco-pet-4.png", maxSide: 800 },
  { key: "petisco-2", file: "produtos/petisco-cao-5.jpg", maxSide: 800 },
  { key: "petisco-3", file: "produtos/petisco-cao-1.jpg", maxSide: 800 },
  // Higiene e Beleza > Banho > Shampoo (originais com typo no nome)
  { key: "shampoo-1", file: "produtos/shaapoo-pet.jpg", maxSide: 800 },
  { key: "shampoo-2", file: "produtos/shaapoo-pet-2.jpg", maxSide: 800 },
  { key: "shampoo-3", file: "produtos/shaapoo-pet-4.jpg", maxSide: 800 },
  // Higiene e Beleza > Banho > Condicionador
  { key: "condicionador-1", file: "produtos/condicionador.webp", maxSide: 800 },
  // Higiene e Beleza > Tapetes higiênicos
  { key: "tapete-1", file: "produtos/tapete-higienico-2.webp", maxSide: 800 },
  { key: "tapete-2", file: "produtos/tapete-higienico.webp", maxSide: 800 },
  // Saúde > Antipulgas
  { key: "antipulgas-1", file: "produtos/antipulga-cao.jpg", maxSide: 800 },
  { key: "antipulgas-2", file: "produtos/antipulga-gato.jpg", maxSide: 800 },
  // Saúde > Suplementos
  { key: "suplemento-1", file: "produtos/suplemento-pet-6.png", maxSide: 800 },
  { key: "suplemento-2", file: "produtos/suplemento-pet-3.jpg", maxSide: 800 },
  { key: "suplemento-3", file: "produtos/suplemento-dog.jpg", maxSide: 800 },
  // Acessórios > Coleiras e guias
  { key: "coleira-1", file: "produtos/coleira-4.jpg", maxSide: 800 },
  { key: "coleira-2", file: "produtos/coleira-5.jpg", maxSide: 800 },
  // Acessórios > Comedouros — só uma: o outro comedouro é o produto que fica
  // deliberadamente sem imagem (AB10).
  { key: "comedouro-1", file: "produtos/comedouro-4.jpg", maxSide: 800 },
  // Conforto > Camas
  { key: "cama-1", file: "produtos/cama-pet-4.jpg", maxSide: 800 },
  { key: "cama-2", file: "produtos/cama-pet.jpg", maxSide: 800 },
  // Conforto > Casinhas
  { key: "casinha-1", file: "produtos/casinha-dog.jpg", maxSide: 800 },
  { key: "casinha-2", file: "produtos/casinha-dog-2.jpg", maxSide: 800 },
  // Brinquedos
  { key: "brinquedo-1", file: "produtos/brinquedo-pet.jpg", maxSide: 800 },
  { key: "brinquedo-2", file: "produtos/brinquedo-cao-2.png", maxSide: 800 },
  { key: "brinquedo-3", file: "produtos/kit-gatificacao.jpg", maxSide: 800 },
  { key: "brinquedo-4", file: "produtos/brinquedo-gato-1.jpg", maxSide: 800 },
];

const SPECS = [...LOGOS, ...PETS, ...PRODUCTS];

async function main() {
  const duplicates = SPECS.map((spec) => spec.key).filter(
    (key, index, all) => all.indexOf(key) !== index,
  );

  if (duplicates.length > 0) {
    throw new Error(
      `Chaves duplicadas no mapeamento: ${duplicates.join(", ")}`,
    );
  }

  const entries: string[] = [];
  let totalBytes = 0;

  for (const spec of SPECS) {
    const source = readFileSync(join(INBOX, spec.file));
    const normalized = await sharp(source)
      .resize({
        width: spec.maxSide,
        height: spec.maxSide,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: QUALITY })
      .toBuffer();

    totalBytes += normalized.length;
    entries.push(`  "${spec.key}":\n    "${normalized.toString("base64")}",`);
  }

  const header = `// GERADO por tools/generate-fake-images.ts — NÃO editar à mão.
// ${SPECS.length} assets, ${(totalBytes / 1024).toFixed(0)} KB de WebP a q${QUALITY}.
//
// Fora do Biome (\`files.includes\` em \`biome.json\`): 2 MB excedem o limite de
// 1 MB por arquivo, e formatar código gerado que ninguém lê não paga o ajuste.
//
// Os bytes das imagens do seed fake moram aqui, em base64, e não como arquivos
// em disco (9.11/AB1): o estágio \`runtime\` do Dockerfile não copia \`src/\` e o
// tsup não empacota \`.webp\`, então o seed do container de produção não
// encontraria arquivo nenhum. Regenerar: \`npx tsx tools/generate-fake-images.ts\`.
//
// Cada valor é o **arquivo de entrada**, não o derivado final: quem grava é
// \`storeImage\` (\`src/lib/storage/image.ts\`), pelo mesmo pipeline de \`sharp\` que
// a API usa, para que o seed produza arquivo com exatamente a mesma forma.

// A união é escrita, e não inferida com \`as const\` + \`keyof typeof\`: com 51
// literais de base64 o \`tsc\` desiste de serializar o tipo inferido
// (TS7056 — "inferred type exceeds the maximum length"), e a anotação
// explícita é o que ele pede.
export type FakeImageKey =
${SPECS.map((spec) => `  | "${spec.key}"`).join("\n")};

const ASSETS: Record<FakeImageKey, string> = {
${entries.join("\n")}
};

export const FAKE_IMAGE_KEYS = Object.keys(ASSETS) as FakeImageKey[];

/** Os bytes de entrada de um asset, prontos para \`storeImage\`. */
export function fakeImageBuffer(key: FakeImageKey): Buffer {
  return Buffer.from(ASSETS[key], "base64");
}
`;

  writeFileSync(OUTPUT, header);

  console.log(
    `${SPECS.length} assets -> ${OUTPUT}\n` +
      `bruto ${(totalBytes / 1024).toFixed(0)} KB, base64 ~${((totalBytes * 4) / 3 / 1024 / 1024).toFixed(2)} MB`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

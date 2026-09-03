import type { PetSpecies, ProductStatus } from "@/generated/prisma/enums";
import type { FakeImageKey } from "./fakeImages.constants";

/**
 * Roster declarativo do catálogo fake (flag `SEED_FAKE_DATA`) — 9 marcas, 20
 * categorias em 3 níveis, 8 tags e 35 produtos.
 *
 * A **chave de idempotência é sempre o `slug`** (ou o `sku`, na variante), e por
 * isso ele é escrito à mão em vez de derivado: `slug`, `name` e `sku` são unique
 * **global** no catálogo (9.6/W6 e 9.7/X1), o índice ignora `deletedAt`, e a
 * checagem de existência do seed precisa achar até a linha soft-deletada — senão
 * o rerun colide em constraint. Ver `seedFakeCatalog.ts`.
 *
 * O que é escrito à mão e o que é gerado (9.11/AB2): nome de marca, categoria,
 * tag e produto são à mão, em pt-BR, porque são o **corpus da busca** da 9.9 — a
 * correção de erro de digitação só se demonstra sobre palavras reais. Preço,
 * custo e estoque saem de um `faker` com seed derivado do `sku` (determinístico
 * e estável, ver `seedFakeCatalog.ts`).
 *
 * Duas coisas ficaram à mão embora a AB2 as tenha posto no lado do faker, e as
 * duas pelo mesmo motivo — a AB11 decidiu usar **marcas reais**:
 *
 * - **`description`**: uma descrição em inglês do `faker.commerce` embaixo de
 *   "Ração Golden Fórmula Cães Adultos" seria absurda numa demo de portfólio.
 * - **`sku`**: `GLD-AD-15KG` é o que um SKU real parece; `A1B2C3D4E5` parece
 *   dado de teste, e alguém vai olhar o SKU na vitrine.
 *
 * O `costCents` é derivado do preço, não sorteado, senão o sorteio produziria
 * custo acima do preço de venda em parte do roster.
 */

export type FakeBrand = {
  slug: string;
  name: string;
  description: string;
  logo: FakeImageKey;
};

/** Uma marca por território, para nenhuma aparecer num ramo onde não existe (AB8). */
export const FAKE_BRANDS: FakeBrand[] = [
  {
    slug: "golden",
    name: "Golden",
    description: "Alimentos super premium para cães e gatos.",
    logo: "brand-golden",
  },
  {
    slug: "whiskas",
    name: "Whiskas",
    description: "Alimentação completa para gatos, seca e úmida.",
    logo: "brand-whiskas",
  },
  {
    slug: "pedigree",
    name: "Pedigree",
    description: "Alimentos e petiscos para cães de todos os portes.",
    logo: "brand-pedigree",
  },
  {
    slug: "sanol",
    name: "Sanol",
    description: "Higiene e cuidado diário para cães e gatos.",
    logo: "brand-sanol",
  },
  {
    slug: "bravecto",
    name: "Bravecto",
    description: "Antiparasitários de longa duração para cães e gatos.",
    logo: "brand-bravecto",
  },
  {
    slug: "vetnil",
    name: "Vetnil",
    description: "Suplementos e nutracêuticos de uso veterinário.",
    logo: "brand-vetnil",
  },
  {
    slug: "chalesco",
    name: "Chalesco",
    description: "Acessórios, comedouros e bebedouros para o dia a dia.",
    logo: "brand-chalesco",
  },
  {
    slug: "jambo",
    name: "Jambo",
    description: "Camas, casinhas e conforto para cães e gatos.",
    logo: "brand-jambo",
  },
  {
    slug: "furacao-pet",
    name: "Furacão Pet",
    description: "Brinquedos e mordedores resistentes.",
    logo: "brand-furacao-pet",
  },
];

export type FakeCategory = {
  slug: string;
  name: string;
  /** `null` é raiz. O pai é referenciado por slug, nunca por id. */
  parentSlug: string | null;
  position: number;
};

/**
 * A árvore modela **função**, nunca espécie — espécie é faceta
 * (`Product.targetSpecies`), pelo ADR `pet-domain-modeling`.
 *
 * A ordem do array é **de cima para baixo** e o seed depende disso: a FK
 * `Category.parentId` aponta para a própria tabela, então o pai precisa existir
 * antes do filho (9.6). Dois ramos chegam ao 3º nível de propósito — a 9.6
 * validou profundidade máxima 3 no service, e uma árvore de 2 níveis nunca
 * exercitaria o limite que o código defende.
 */
export const FAKE_CATEGORIES: FakeCategory[] = [
  { slug: "alimentacao", name: "Alimentação", parentSlug: null, position: 0 },
  { slug: "racao", name: "Ração", parentSlug: "alimentacao", position: 0 },
  { slug: "racao-seca", name: "Ração seca", parentSlug: "racao", position: 0 },
  {
    slug: "racao-umida",
    name: "Ração úmida",
    parentSlug: "racao",
    position: 1,
  },
  {
    slug: "petiscos",
    name: "Petiscos",
    parentSlug: "alimentacao",
    position: 1,
  },
  {
    slug: "higiene-e-beleza",
    name: "Higiene e Beleza",
    parentSlug: null,
    position: 1,
  },
  { slug: "banho", name: "Banho", parentSlug: "higiene-e-beleza", position: 0 },
  { slug: "shampoo", name: "Shampoo", parentSlug: "banho", position: 0 },
  {
    slug: "condicionador",
    name: "Condicionador",
    parentSlug: "banho",
    position: 1,
  },
  {
    slug: "tapetes-higienicos",
    name: "Tapetes higiênicos",
    parentSlug: "higiene-e-beleza",
    position: 1,
  },
  { slug: "saude", name: "Saúde", parentSlug: null, position: 2 },
  { slug: "antipulgas", name: "Antipulgas", parentSlug: "saude", position: 0 },
  {
    slug: "suplementos",
    name: "Suplementos",
    parentSlug: "saude",
    position: 1,
  },
  { slug: "acessorios", name: "Acessórios", parentSlug: null, position: 3 },
  {
    slug: "coleiras-e-guias",
    name: "Coleiras e guias",
    parentSlug: "acessorios",
    position: 0,
  },
  {
    slug: "comedouros",
    name: "Comedouros",
    parentSlug: "acessorios",
    position: 1,
  },
  { slug: "conforto", name: "Conforto", parentSlug: null, position: 4 },
  { slug: "camas", name: "Camas", parentSlug: "conforto", position: 0 },
  { slug: "casinhas", name: "Casinhas", parentSlug: "conforto", position: 1 },
  { slug: "brinquedos", name: "Brinquedos", parentSlug: null, position: 5 },
];

export type FakeTag = { slug: string; name: string };

/** Rótulo transversal: atravessa a árvore sem pertencer a um ramo. */
export const FAKE_TAGS: FakeTag[] = [
  { slug: "natural", name: "Natural" },
  { slug: "sem-corante", name: "Sem corante" },
  { slug: "filhote", name: "Filhote" },
  { slug: "senior", name: "Sênior" },
  { slug: "hipoalergenico", name: "Hipoalergênico" },
  { slug: "lancamento", name: "Lançamento" },
  { slug: "promocao", name: "Promoção" },
  { slug: "premium", name: "Premium" },
];

export type FakeVariant = {
  sku: string;
  label: string;
  /** Ausente = sorteado pelo faker; `0` é o cenário "esgotado" (AB10). */
  stockQuantity?: number;
  /** `true` gera `compareAtPriceCents` acima do preço — o "de/por" da vitrine. */
  discounted?: boolean;
  weightGrams?: number;
  volumeMl?: number;
  sizeLabel?: string;
  /** Faixa de preço em centavos; o faker sorteia dentro dela. */
  priceRange: [number, number];
};

export type FakeProduct = {
  slug: string;
  name: string;
  description: string;
  brandSlug: string;
  categorySlugs: string[];
  tagSlugs: string[];
  status: ProductStatus;
  targetSpecies: PetSpecies[];
  /** Vazio = produto sem imagem nenhuma (AB10). Mais de uma = galeria. */
  images: FakeImageKey[];
  /** Soft-deletado depois de criado — o cenário de catálogo excluído (AB7). */
  softDeleted?: true;
  variants: FakeVariant[];
};

/**
 * 35 produtos: 28 `ACTIVE`, 4 `DRAFT`, 2 `DISCONTINUED` e 1 soft-deletado
 * (AB7). A distribuição por status não é decorativa — é o que faz a view
 * pública da 9.8 ter o que esconder e a de staff ter o que mostrar a mais.
 *
 * Cenários deliberados (AB10), todos garantidos por teste:
 * - `bebedouro-chalesco-fonte-automatica` **sem imagem nenhuma** — a vitrine
 *   precisa saber renderizar isso;
 * - `casinha-jambo-madeira-ecologica` com o produto **inteiro esgotado** e
 *   `bola-macica-de-borracha-furacao-pet` com a **variante default** esgotada e
 *   as outras com estoque — dois esgotados de forma diferente;
 * - `condicionador-sanol-caes-e-gatos` é o único item da folha de 3º nível
 *   `condicionador` — folha de item único;
 * - quatro produtos com `discounted`, que viram `compareAtPriceCents`.
 */
export const FAKE_PRODUCTS: FakeProduct[] = [
  // --- Alimentação > Ração > Ração seca -------------------------------------
  {
    slug: "racao-golden-formula-caes-adultos-frango-e-arroz",
    name: "Ração Golden Fórmula Cães Adultos Frango e Arroz",
    description:
      "Alimento super premium para cães adultos de porte médio e grande, com frango e arroz. Fórmula com prebióticos e ômega 3 e 6 para pelagem brilhante e digestão equilibrada.",
    brandSlug: "golden",
    categorySlugs: ["racao-seca"],
    tagSlugs: ["premium", "natural"],
    status: "ACTIVE",
    targetSpecies: ["DOG"],
    // O único com galeria: três fotos distintas do mesmo tipo de produto, para
    // a reordenação e a "capa é a posição 0" (9.10/AA13) terem o que mostrar.
    images: ["racao-seca-cao-1", "racao-seca-cao-2", "racao-seca-cao-3"],
    variants: [
      {
        sku: "GLD-AD-3KG",
        label: "3 kg",
        weightGrams: 3000,
        priceRange: [4500, 6500],
      },
      {
        sku: "GLD-AD-15KG",
        label: "15 kg",
        weightGrams: 15000,
        priceRange: [18000, 24000],
      },
      {
        sku: "GLD-AD-20KG",
        label: "20 kg",
        weightGrams: 20000,
        priceRange: [23000, 29000],
      },
    ],
  },
  {
    slug: "racao-golden-formula-caes-filhotes-frango-e-arroz",
    name: "Ração Golden Fórmula Cães Filhotes Frango e Arroz",
    description:
      "Alimento super premium para cães filhotes, com frango e arroz. Grãos menores, proteína elevada e cálcio para o crescimento dos ossos.",
    brandSlug: "golden",
    categorySlugs: ["racao-seca"],
    tagSlugs: ["premium", "filhote"],
    status: "ACTIVE",
    targetSpecies: ["DOG"],
    images: ["racao-seca-cao-4"],
    variants: [
      {
        sku: "GLD-FI-3KG",
        label: "3 kg",
        weightGrams: 3000,
        priceRange: [4800, 6800],
      },
      {
        sku: "GLD-FI-15KG",
        label: "15 kg",
        weightGrams: 15000,
        priceRange: [19000, 25000],
      },
    ],
  },
  {
    slug: "racao-golden-formula-gatos-adultos-salmao",
    name: "Ração Golden Fórmula Gatos Adultos Salmão",
    description:
      "Alimento super premium para gatos adultos, sabor salmão. Auxilia no controle de bolas de pelo e na saúde do trato urinário.",
    brandSlug: "golden",
    categorySlugs: ["racao-seca"],
    tagSlugs: ["premium"],
    status: "ACTIVE",
    targetSpecies: ["CAT"],
    images: ["racao-seca-gato-1"],
    variants: [
      {
        sku: "GLD-GT-101KG",
        label: "10,1 kg",
        weightGrams: 10100,
        priceRange: [21000, 27000],
      },
    ],
  },
  {
    slug: "racao-whiskas-gatos-adultos-carne",
    name: "Ração Whiskas Gatos Adultos Carne",
    description:
      "Alimento completo e balanceado para gatos adultos, sabor carne. Croquetes crocantes com vitaminas e minerais para o dia a dia.",
    brandSlug: "whiskas",
    categorySlugs: ["racao-seca"],
    tagSlugs: [],
    status: "ACTIVE",
    targetSpecies: ["CAT"],
    images: ["racao-seca-gato-2"],
    variants: [
      {
        sku: "WKS-AD-3KG",
        label: "3 kg",
        weightGrams: 3000,
        priceRange: [5500, 7500],
      },
    ],
  },
  {
    slug: "racao-whiskas-gatos-castrados-frango",
    name: "Ração Whiskas Gatos Castrados Frango",
    description:
      "Alimento para gatos castrados, sabor frango. Teor calórico reduzido e L-carnitina para o controle de peso após a castração.",
    brandSlug: "whiskas",
    categorySlugs: ["racao-seca"],
    tagSlugs: ["senior"],
    status: "ACTIVE",
    targetSpecies: ["CAT"],
    images: ["racao-seca-gato-3"],
    variants: [
      {
        sku: "WKS-CA-27KG",
        label: "2,7 kg",
        weightGrams: 2700,
        priceRange: [5800, 7800],
      },
    ],
  },
  {
    slug: "racao-pedigree-caes-filhotes-frango",
    name: "Ração Pedigree Cães Filhotes Frango",
    description:
      "Alimento para cães filhotes, sabor frango. Croquetes de tamanho reduzido, com cálcio e proteínas para as fases de crescimento.",
    brandSlug: "pedigree",
    categorySlugs: ["racao-seca"],
    tagSlugs: ["filhote"],
    // DRAFT: cadastrado, ainda não publicado — invisível na vitrine pública.
    status: "DRAFT",
    targetSpecies: ["DOG"],
    images: ["racao-seca-cao-5"],
    variants: [
      {
        sku: "PDG-FI-1KG",
        label: "1 kg",
        weightGrams: 1000,
        priceRange: [1800, 2800],
      },
    ],
  },
  // --- Alimentação > Ração > Ração úmida ------------------------------------
  {
    slug: "sache-whiskas-gatos-adultos-carne-ao-molho",
    name: "Sachê Whiskas Gatos Adultos Carne ao Molho",
    description:
      "Alimento úmido para gatos adultos, pedaços de carne ao molho. Complementa a ração seca e ajuda na hidratação diária.",
    brandSlug: "whiskas",
    categorySlugs: ["racao-umida"],
    tagSlugs: [],
    status: "ACTIVE",
    targetSpecies: ["CAT"],
    images: ["racao-umida-1"],
    variants: [
      {
        sku: "WKS-SC-85G",
        label: "85 g",
        weightGrams: 85,
        priceRange: [250, 450],
      },
    ],
  },
  {
    slug: "lata-whiskas-gatos-filhotes-frango",
    name: "Lata Whiskas Gatos Filhotes Frango",
    description:
      "Alimento úmido para gatos filhotes, sabor frango. Textura patê, fácil de comer na transição do desmame.",
    brandSlug: "whiskas",
    categorySlugs: ["racao-umida"],
    tagSlugs: ["filhote"],
    status: "ACTIVE",
    targetSpecies: ["CAT"],
    images: ["racao-umida-2"],
    variants: [
      {
        sku: "WKS-LT-290G",
        label: "290 g",
        weightGrams: 290,
        priceRange: [700, 1100],
      },
    ],
  },
  {
    slug: "sache-pedigree-caes-adultos-carne",
    name: "Sachê Pedigree Cães Adultos Carne",
    description:
      "Alimento úmido para cães adultos, pedaços de carne ao molho. Pode ser servido puro ou misturado à ração seca.",
    brandSlug: "pedigree",
    categorySlugs: ["racao-umida"],
    tagSlugs: ["promocao"],
    status: "ACTIVE",
    targetSpecies: ["DOG"],
    images: ["racao-umida-3"],
    variants: [
      {
        sku: "PDG-SC-100G",
        label: "100 g",
        weightGrams: 100,
        discounted: true,
        priceRange: [300, 500],
      },
    ],
  },
  // --- Alimentação > Petiscos ----------------------------------------------
  {
    slug: "bifinho-golden-caes-carne",
    name: "Bifinho Golden Cães Carne",
    description:
      "Petisco macio para cães, sabor carne. Sem corantes artificiais, indicado para adestramento e recompensa.",
    brandSlug: "golden",
    categorySlugs: ["petiscos"],
    tagSlugs: ["natural", "sem-corante"],
    status: "ACTIVE",
    targetSpecies: ["DOG"],
    images: ["petisco-1"],
    variants: [
      {
        sku: "GLD-BF-60G",
        label: "60 g",
        weightGrams: 60,
        priceRange: [600, 1000],
      },
    ],
  },
  {
    slug: "pedigree-dentastix-caes-adultos",
    name: "Pedigree Dentastix Cães Adultos",
    description:
      "Petisco de textura especial que auxilia na redução do tártaro. Uso diário recomendado para cães adultos.",
    brandSlug: "pedigree",
    categorySlugs: ["petiscos"],
    tagSlugs: [],
    status: "ACTIVE",
    targetSpecies: ["DOG"],
    images: ["petisco-2"],
    variants: [
      {
        sku: "PDG-DX-77G",
        label: "77 g",
        weightGrams: 77,
        priceRange: [900, 1500],
      },
    ],
  },
  {
    slug: "pedigree-biscrok-caes-adultos",
    name: "Pedigree Biscrok Cães Adultos",
    description:
      "Biscoito crocante para cães adultos, em três sabores. Complemento entre as refeições, com cálcio e vitaminas.",
    brandSlug: "pedigree",
    categorySlugs: ["petiscos"],
    tagSlugs: ["promocao"],
    status: "ACTIVE",
    targetSpecies: ["DOG"],
    images: ["petisco-3"],
    variants: [
      {
        sku: "PDG-BK-500G",
        label: "500 g",
        weightGrams: 500,
        discounted: true,
        priceRange: [1500, 2300],
      },
    ],
  },
  // --- Higiene e Beleza > Banho > Shampoo ----------------------------------
  {
    slug: "shampoo-sanol-caes-e-gatos-neutro",
    name: "Shampoo Sanol Cães e Gatos Neutro",
    description:
      "Shampoo de pH neutro para cães e gatos, indicado para banhos frequentes. Limpa sem agredir a barreira natural da pele.",
    brandSlug: "sanol",
    categorySlugs: ["shampoo"],
    tagSlugs: ["hipoalergenico"],
    status: "ACTIVE",
    targetSpecies: ["DOG", "CAT"],
    images: ["shampoo-1"],
    variants: [
      {
        sku: "SNL-SH-500ML",
        label: "500 ml",
        volumeMl: 500,
        priceRange: [1800, 2800],
      },
      {
        sku: "SNL-SH-1L",
        label: "1 L",
        volumeMl: 1000,
        priceRange: [3000, 4500],
      },
    ],
  },
  {
    slug: "shampoo-sanol-filhotes",
    name: "Shampoo Sanol Filhotes",
    description:
      "Shampoo suave para filhotes de cães e gatos, sem lágrimas. Fórmula hipoalergênica para a pele sensível dos primeiros meses.",
    brandSlug: "sanol",
    categorySlugs: ["shampoo"],
    tagSlugs: ["filhote", "hipoalergenico"],
    status: "ACTIVE",
    targetSpecies: ["DOG", "CAT"],
    images: ["shampoo-2"],
    variants: [
      {
        sku: "SNL-SF-500ML",
        label: "500 ml",
        volumeMl: 500,
        priceRange: [2000, 3000],
      },
    ],
  },
  {
    slug: "shampoo-sanol-pelos-claros",
    name: "Shampoo Sanol Pelos Claros",
    description:
      "Shampoo clareador para cães e gatos de pelagem branca ou clara. Realça o brilho e reduz o amarelado sem descolorir.",
    brandSlug: "sanol",
    categorySlugs: ["shampoo"],
    tagSlugs: [],
    status: "DRAFT",
    targetSpecies: ["DOG", "CAT"],
    images: ["shampoo-3"],
    variants: [
      {
        sku: "SNL-SP-500ML",
        label: "500 ml",
        volumeMl: 500,
        priceRange: [2200, 3200],
      },
    ],
  },
  // --- Higiene e Beleza > Banho > Condicionador ----------------------------
  // Único item da folha de 3º nível `condicionador` (AB10).
  {
    slug: "condicionador-sanol-caes-e-gatos",
    name: "Condicionador Sanol Cães e Gatos",
    description:
      "Condicionador para cães e gatos, com queratina. Desembaraça, reduz o nó e facilita a escovação depois do banho.",
    brandSlug: "sanol",
    categorySlugs: ["condicionador"],
    tagSlugs: [],
    status: "ACTIVE",
    targetSpecies: ["DOG", "CAT"],
    images: ["condicionador-1"],
    variants: [
      {
        sku: "SNL-CD-500ML",
        label: "500 ml",
        volumeMl: 500,
        priceRange: [1900, 2900],
      },
    ],
  },
  // --- Higiene e Beleza > Tapetes higiênicos -------------------------------
  {
    slug: "tapete-higienico-sanol-super-secante",
    name: "Tapete Higiênico Sanol Super Secante",
    description:
      "Tapete higiênico com gel super absorvente, para cães em treinamento ou apartamento. Trava o líquido e controla o odor.",
    brandSlug: "sanol",
    categorySlugs: ["tapetes-higienicos"],
    tagSlugs: ["lancamento"],
    status: "ACTIVE",
    targetSpecies: ["DOG"],
    images: ["tapete-1"],
    variants: [
      {
        sku: "SNL-TP-30UN",
        label: "30 unidades",
        discounted: true,
        priceRange: [4000, 6000],
      },
    ],
  },
  {
    slug: "tapete-higienico-sanol-carvao-ativado",
    name: "Tapete Higiênico Sanol Carvão Ativado",
    description:
      "Tapete higiênico com camada de carvão ativado para neutralizar o odor. Base impermeável e bordas seladas.",
    brandSlug: "sanol",
    categorySlugs: ["tapetes-higienicos"],
    tagSlugs: [],
    status: "ACTIVE",
    targetSpecies: ["DOG"],
    images: ["tapete-2"],
    // O produto soft-deletado: sai da vitrine e do staff, e o `slug` fica
    // preso no unique global — recriá-lo dá 409 (9.7/X1).
    softDeleted: true,
    variants: [
      {
        sku: "SNL-TC-30UN",
        label: "30 unidades",
        priceRange: [4500, 6500],
      },
    ],
  },
  // --- Saúde > Antipulgas --------------------------------------------------
  {
    slug: "bravecto-antipulgas-e-carrapatos-caes",
    name: "Bravecto Antipulgas e Carrapatos Cães",
    description:
      "Antiparasitário oral para cães, com proteção de até 12 semanas contra pulgas e carrapatos. Dose única, por faixa de peso.",
    brandSlug: "bravecto",
    categorySlugs: ["antipulgas"],
    tagSlugs: [],
    status: "ACTIVE",
    targetSpecies: ["DOG"],
    images: ["antipulgas-1"],
    variants: [
      {
        sku: "BRV-DG-2A45",
        label: "2 a 4,5 kg",
        sizeLabel: "2-4,5 kg",
        priceRange: [11000, 15000],
      },
      {
        sku: "BRV-DG-10A20",
        label: "10 a 20 kg",
        sizeLabel: "10-20 kg",
        priceRange: [13000, 17000],
      },
      {
        sku: "BRV-DG-20A40",
        label: "20 a 40 kg",
        sizeLabel: "20-40 kg",
        priceRange: [15000, 19000],
      },
    ],
  },
  {
    slug: "bravecto-antipulgas-e-carrapatos-gatos",
    name: "Bravecto Antipulgas e Carrapatos Gatos",
    description:
      "Antiparasitário tópico para gatos, com proteção de até 12 semanas. Aplicação única na nuca, por faixa de peso.",
    brandSlug: "bravecto",
    categorySlugs: ["antipulgas"],
    tagSlugs: [],
    status: "ACTIVE",
    targetSpecies: ["CAT"],
    images: ["antipulgas-2"],
    variants: [
      {
        sku: "BRV-CT-12A28",
        label: "1,2 a 2,8 kg",
        sizeLabel: "1,2-2,8 kg",
        priceRange: [12000, 16000],
      },
    ],
  },
  // --- Saúde > Suplementos -------------------------------------------------
  {
    slug: "vetnil-condrivet-caes",
    name: "Vetnil Condrivet Cães",
    description:
      "Suplemento condroprotetor para cães, com glucosamina e condroitina. Indicado para articulações de animais idosos ou de grande porte.",
    brandSlug: "vetnil",
    categorySlugs: ["suplementos"],
    tagSlugs: ["senior"],
    status: "ACTIVE",
    targetSpecies: ["DOG"],
    images: ["suplemento-1"],
    variants: [
      {
        sku: "VTN-CV-30CP",
        label: "30 comprimidos",
        priceRange: [6000, 9000],
      },
    ],
  },
  {
    slug: "vetnil-organew-caes-e-gatos",
    name: "Vetnil Organew Cães e Gatos",
    description:
      "Probiótico e prebiótico em pó para cães e gatos. Auxilia a flora intestinal em quadros de diarreia e troca de alimento.",
    brandSlug: "vetnil",
    categorySlugs: ["suplementos"],
    tagSlugs: ["natural"],
    status: "ACTIVE",
    targetSpecies: ["DOG", "CAT"],
    images: ["suplemento-2"],
    variants: [
      {
        sku: "VTN-OR-100G",
        label: "100 g",
        weightGrams: 100,
        priceRange: [3500, 5500],
      },
    ],
  },
  {
    slug: "vetnil-aminomix-pet",
    name: "Vetnil Aminomix Pet",
    description:
      "Suplemento vitamínico e mineral em pó, de amplo espectro. Uso em cães, gatos e pequenos mamíferos, misturado ao alimento.",
    brandSlug: "vetnil",
    categorySlugs: ["suplementos"],
    tagSlugs: [],
    status: "DRAFT",
    // Três espécies-alvo: a faceta é lista, não nível de árvore (ADR
    // `pet-domain-modeling`).
    targetSpecies: ["DOG", "CAT", "RABBIT"],
    images: ["suplemento-3"],
    variants: [
      {
        sku: "VTN-AM-500G",
        label: "500 g",
        weightGrams: 500,
        priceRange: [4000, 6000],
      },
    ],
  },
  // --- Acessórios > Coleiras e guias ---------------------------------------
  {
    slug: "coleira-chalesco-nylon-ajustavel",
    name: "Coleira Chalesco Nylon Ajustável",
    description:
      "Coleira de nylon resistente com fecho de engate rápido e argola para plaquinha. Ajuste em três tamanhos.",
    brandSlug: "chalesco",
    categorySlugs: ["coleiras-e-guias"],
    tagSlugs: [],
    status: "ACTIVE",
    targetSpecies: ["DOG", "CAT"],
    images: ["coleira-1"],
    variants: [
      { sku: "CHL-CN-P", label: "P", sizeLabel: "P", priceRange: [1800, 2600] },
      { sku: "CHL-CN-M", label: "M", sizeLabel: "M", priceRange: [2200, 3000] },
      { sku: "CHL-CN-G", label: "G", sizeLabel: "G", priceRange: [2600, 3600] },
    ],
  },
  {
    slug: "guia-retratil-chalesco",
    name: "Guia Retrátil Chalesco",
    description:
      "Guia retrátil com travamento por botão e fita de nylon. Para passeios com controle de distância.",
    brandSlug: "chalesco",
    categorySlugs: ["coleiras-e-guias"],
    tagSlugs: ["lancamento"],
    status: "ACTIVE",
    targetSpecies: ["DOG"],
    images: ["coleira-2"],
    variants: [{ sku: "CHL-GR-3M", label: "3 m", priceRange: [4500, 6500] }],
  },
  // --- Acessórios > Comedouros ---------------------------------------------
  {
    slug: "comedouro-chalesco-inox-antiderrapante",
    name: "Comedouro Chalesco Inox Antiderrapante",
    description:
      "Comedouro de aço inox com base de silicone antiderrapante. Não enferruja e vai à lava-louças.",
    brandSlug: "chalesco",
    categorySlugs: ["comedouros"],
    tagSlugs: [],
    status: "ACTIVE",
    targetSpecies: ["DOG", "CAT"],
    images: ["comedouro-1"],
    variants: [
      {
        sku: "CHL-CI-300ML",
        label: "300 ml",
        volumeMl: 300,
        priceRange: [2000, 3000],
      },
      {
        sku: "CHL-CI-900ML",
        label: "900 ml",
        volumeMl: 900,
        priceRange: [3200, 4400],
      },
    ],
  },
  {
    slug: "bebedouro-chalesco-fonte-automatica",
    name: "Bebedouro Chalesco Fonte Automática",
    description:
      "Fonte de água com filtro de carvão e fluxo contínuo, para estimular a hidratação de gatos e cães pequenos.",
    brandSlug: "chalesco",
    categorySlugs: ["comedouros"],
    tagSlugs: [],
    status: "ACTIVE",
    targetSpecies: ["DOG", "CAT"],
    // O produto **sem imagem nenhuma** (AB10): a vitrine da 9.8 precisa saber
    // renderizar a ausência, e um catálogo em que tudo tem foto nunca prova isso.
    images: [],
    variants: [
      {
        sku: "CHL-BF-2L",
        label: "2 L",
        volumeMl: 2000,
        priceRange: [14000, 19000],
      },
    ],
  },
  // --- Conforto > Camas ----------------------------------------------------
  {
    slug: "cama-jambo-iglu-pelucia",
    name: "Cama Jambo Iglu Pelúcia",
    description:
      "Cama fechada em formato iglu, revestida em pelúcia. Mantém o calor e dá sensação de abrigo a cães e gatos.",
    brandSlug: "jambo",
    categorySlugs: ["camas"],
    tagSlugs: [],
    status: "ACTIVE",
    targetSpecies: ["DOG", "CAT"],
    images: ["cama-1"],
    variants: [
      {
        sku: "JMB-IG-P",
        label: "P",
        sizeLabel: "P",
        priceRange: [9000, 13000],
      },
      {
        sku: "JMB-IG-M",
        label: "M",
        sizeLabel: "M",
        priceRange: [12000, 16000],
      },
      {
        sku: "JMB-IG-G",
        label: "G",
        sizeLabel: "G",
        priceRange: [15000, 20000],
      },
    ],
  },
  {
    slug: "colchonete-jambo-impermeavel",
    name: "Colchonete Jambo Impermeável",
    description:
      "Colchonete com capa impermeável e removível, para uso em caixa de transporte ou canil.",
    brandSlug: "jambo",
    categorySlugs: ["camas"],
    tagSlugs: [],
    // DISCONTINUED: saiu de linha, mas o histórico de venda continua válido —
    // é o estado que o soft delete não deve cobrir.
    status: "DISCONTINUED",
    targetSpecies: ["DOG"],
    images: ["cama-2"],
    variants: [
      { sku: "JMB-CO-M", label: "M", sizeLabel: "M", priceRange: [7000, 9500] },
    ],
  },
  // --- Conforto > Casinhas -------------------------------------------------
  {
    slug: "casinha-jambo-plastica-desmontavel",
    name: "Casinha Jambo Plástica Desmontável",
    description:
      "Casinha de plástico desmontável, fácil de higienizar. Telhado removível e piso elevado para escoar a água da chuva.",
    brandSlug: "jambo",
    categorySlugs: ["casinhas"],
    tagSlugs: [],
    status: "ACTIVE",
    targetSpecies: ["DOG"],
    images: ["casinha-1"],
    variants: [
      {
        sku: "JMB-CP-N1",
        label: "Nº 1",
        sizeLabel: "N1",
        priceRange: [11000, 15000],
      },
      {
        sku: "JMB-CP-N2",
        label: "Nº 2",
        sizeLabel: "N2",
        priceRange: [15000, 19000],
      },
      {
        sku: "JMB-CP-N3",
        label: "Nº 3",
        sizeLabel: "N3",
        priceRange: [19000, 24000],
      },
    ],
  },
  {
    slug: "casinha-jambo-madeira-ecologica",
    name: "Casinha Jambo Madeira Ecológica",
    description:
      "Casinha de madeira de reflorestamento com acabamento impermeabilizado. Montagem por encaixe, sem ferramenta.",
    brandSlug: "jambo",
    categorySlugs: ["casinhas"],
    tagSlugs: ["premium"],
    status: "ACTIVE",
    targetSpecies: ["DOG"],
    images: ["casinha-2"],
    variants: [
      // Produto **inteiro** esgotado: única variante em zero (AB10).
      {
        sku: "JMB-CM-M",
        label: "M",
        sizeLabel: "M",
        stockQuantity: 0,
        priceRange: [28000, 36000],
      },
    ],
  },
  // --- Brinquedos ----------------------------------------------------------
  {
    slug: "bola-macica-de-borracha-furacao-pet",
    name: "Bola Maciça de Borracha Furacão Pet",
    description:
      "Bola maciça de borracha atóxica, resistente à mordida. Flutua na água e serve para busca e brincadeira de arremesso.",
    brandSlug: "furacao-pet",
    categorySlugs: ["brinquedos"],
    tagSlugs: [],
    status: "ACTIVE",
    targetSpecies: ["DOG"],
    images: ["brinquedo-1"],
    variants: [
      // A **variante default** esgotada, com as outras em estoque (AB10): o
      // esgotado parcial, que é diferente do produto inteiro em zero.
      {
        sku: "FRP-BL-P",
        label: "P",
        sizeLabel: "P",
        stockQuantity: 0,
        priceRange: [1500, 2200],
      },
      { sku: "FRP-BL-M", label: "M", sizeLabel: "M", priceRange: [1900, 2700] },
      { sku: "FRP-BL-G", label: "G", sizeLabel: "G", priceRange: [2300, 3200] },
    ],
  },
  {
    slug: "mordedor-osso-de-nylon-furacao-pet",
    name: "Mordedor Osso de Nylon Furacão Pet",
    description:
      "Mordedor em nylon com relevo, para cães que destroem brinquedo macio. Ajuda a limpar os dentes durante a mordida.",
    brandSlug: "furacao-pet",
    categorySlugs: ["brinquedos"],
    tagSlugs: [],
    status: "ACTIVE",
    targetSpecies: ["DOG"],
    images: ["brinquedo-2"],
    variants: [
      { sku: "FRP-MO-M", label: "M", sizeLabel: "M", priceRange: [2500, 3500] },
      { sku: "FRP-MO-G", label: "G", sizeLabel: "G", priceRange: [3200, 4400] },
    ],
  },
  {
    slug: "arranhador-torre-para-gatos-furacao-pet",
    name: "Arranhador Torre para Gatos Furacão Pet",
    description:
      "Arranhador em torre com dois níveis, poste de sisal e brinquedo pendurado. Poupa o sofá e dá altura ao gato.",
    brandSlug: "furacao-pet",
    categorySlugs: ["brinquedos"],
    tagSlugs: ["lancamento", "premium"],
    status: "DRAFT",
    targetSpecies: ["CAT"],
    images: ["brinquedo-3"],
    variants: [
      { sku: "FRP-AR-UNICO", label: "Único", priceRange: [19000, 26000] },
    ],
  },
  {
    slug: "varinha-com-penas-furacao-pet",
    name: "Varinha com Penas Furacão Pet",
    description:
      "Varinha com penas naturais e guizo, para brincadeira interativa com gatos. Estimula o instinto de caça.",
    brandSlug: "furacao-pet",
    categorySlugs: ["brinquedos"],
    tagSlugs: ["promocao"],
    status: "DISCONTINUED",
    targetSpecies: ["CAT"],
    images: ["brinquedo-4"],
    variants: [
      {
        sku: "FRP-VP-UNICO",
        label: "Único",
        discounted: true,
        priceRange: [1200, 1800],
      },
    ],
  },
];

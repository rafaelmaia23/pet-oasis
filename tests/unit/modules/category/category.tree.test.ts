import { describe, expect, it } from "vitest";
import {
  buildTree,
  type CategoryNode,
  depthOf,
  heightOf,
  isInSubtreeOf,
  subtreeIdsOf,
} from "@/modules/category/category.tree";

/**
 * As regras da árvore (9.6/W1 e W3) são puras: dependem só do par
 * `(id, parentId)` de todas as categorias ativas, que o service lê **uma vez**
 * por escrita. Testá-las aqui é o que evita subir a cadeia com N queries no
 * repositório e o que deixa o caso difícil — re-parentar uma subárvore que
 * estouraria o limite — barato de provar.
 *
 *   raiz (alimentacao)
 *     └── racao
 *           └── racao-seca
 *   raiz (higiene)
 */
const nodes: CategoryNode[] = [
  { id: "alimentacao", parentId: null },
  { id: "racao", parentId: "alimentacao" },
  { id: "racao-seca", parentId: "racao" },
  { id: "higiene", parentId: null },
];

describe("depthOf", () => {
  it("counts the root as level 1", () => {
    expect(depthOf(nodes, "alimentacao")).toBe(1);
    expect(depthOf(nodes, "racao")).toBe(2);
    expect(depthOf(nodes, "racao-seca")).toBe(3);
  });

  it("returns 0 for a node that is not in the list", () => {
    expect(depthOf(nodes, "inexistente")).toBe(0);
  });
});

describe("heightOf", () => {
  it("counts a leaf as height 1", () => {
    expect(heightOf(nodes, "racao-seca")).toBe(1);
    expect(heightOf(nodes, "higiene")).toBe(1);
  });

  it("counts the deepest branch below the node", () => {
    expect(heightOf(nodes, "racao")).toBe(2);
    expect(heightOf(nodes, "alimentacao")).toBe(3);
  });
});

describe("isInSubtreeOf", () => {
  it("is true for the node itself — a category cannot be its own parent", () => {
    expect(isInSubtreeOf(nodes, "racao", "racao")).toBe(true);
  });

  it("is true for any descendant, which is what makes a cycle detectable", () => {
    expect(isInSubtreeOf(nodes, "racao-seca", "alimentacao")).toBe(true);
  });

  it("is false for a sibling branch", () => {
    expect(isInSubtreeOf(nodes, "higiene", "alimentacao")).toBe(false);
  });

  it("is false upwards — the ancestor is not inside its own descendant", () => {
    expect(isInSubtreeOf(nodes, "alimentacao", "racao")).toBe(false);
  });
});

/**
 * A expansão que o filtro `?category=` da 9.8 precisa (9.6/W2): produto vincula
 * a qualquer nó, então filtrar só pelo nó exato esconderia metade da vitrine.
 */
describe("subtreeIdsOf", () => {
  it("includes the node itself, which is what makes a leaf filter work", () => {
    expect(subtreeIdsOf(nodes, "racao-seca")).toEqual(["racao-seca"]);
  });

  it("descends the whole branch from a root", () => {
    expect(subtreeIdsOf(nodes, "alimentacao").sort()).toEqual([
      "alimentacao",
      "racao",
      "racao-seca",
    ]);
  });

  it("stops at the branch — a sibling never enters", () => {
    expect(subtreeIdsOf(nodes, "alimentacao")).not.toContain("higiene");
  });

  it("returns an empty list for a node that is not in the tree", () => {
    // O service traduz isso em "lista vazia", não em 404: slug inexistente é
    // filtro, não resolução de recurso (V2).
    expect(subtreeIdsOf(nodes, "inexistente")).toEqual([]);
  });

  it("does not loop forever on a cycle already stored in the database", () => {
    const cyclic: CategoryNode[] = [
      { id: "a", parentId: "b" },
      { id: "b", parentId: "a" },
    ];

    expect(subtreeIdsOf(cyclic, "a").sort()).toEqual(["a", "b"]);
  });
});

describe("buildTree", () => {
  const rows = [
    { id: "b", parentId: null, position: 1, name: "Bravo" },
    { id: "a", parentId: null, position: 0, name: "Alfa" },
    { id: "a2", parentId: "a", position: 1, name: "Zeta filha" },
    { id: "a1", parentId: "a", position: 0, name: "Alfa filha" },
  ];

  it("nests children inside their parent and returns only the roots", () => {
    const tree = buildTree(rows);

    expect(tree.map((node) => node.id)).toEqual(["a", "b"]);
    expect(tree[0]?.children.map((node) => node.id)).toEqual(["a1", "a2"]);
    expect(tree[1]?.children).toEqual([]);
  });

  it("orders siblings by position, then by name", () => {
    const tied = [
      { id: "x", parentId: null, position: 0, name: "Zebra" },
      { id: "y", parentId: null, position: 0, name: "Abelha" },
    ];

    expect(buildTree(tied).map((node) => node.id)).toEqual(["y", "x"]);
  });

  it("promotes a node whose parent is not in the list to the root level", () => {
    // Acontece quando o pai foi soft-deletado: a leitura filtra `deletedAt`,
    // então o filho vivo chegaria aqui apontando para alguém que não veio.
    // Sumir com ele seria pior — a categoria existe e ninguém a veria.
    const orphan = [{ id: "solto", parentId: "morto", position: 0, name: "S" }];

    expect(buildTree(orphan).map((node) => node.id)).toEqual(["solto"]);
  });
});

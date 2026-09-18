/**
 * Regras da árvore de categorias, puras (9.6/W1 e W3).
 *
 * Todas operam sobre a lista de **todas as categorias ativas** — que o service
 * lê uma vez por escrita — em vez de subir a cadeia com uma query por nível. A
 * taxonomia tem no máximo três níveis e dezenas de linhas, então carregar tudo
 * é mais barato que a alternativa, e deixa o caso difícil (re-parentar uma
 * subárvore inteira) resolvido pela mesma função.
 */

export type CategoryNode = { id: string; parentId: string | null };

/** Profundidade do nó na árvore, contando a raiz como 1. Nó ausente é 0. */
export function depthOf(nodes: CategoryNode[], id: string): number {
  const byId = new Map(nodes.map((node) => [node.id, node]));

  let depth = 0;
  let current = byId.get(id);

  // O teto do laço é o tamanho da lista: mesmo com um ciclo já gravado no banco
  // (que as validações impedem, mas o `while` não pode confiar nisso), a
  // contagem para em vez de girar para sempre.
  while (current && depth <= nodes.length) {
    depth += 1;
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }

  return depth;
}

/** Altura da subárvore enraizada no nó, contando o próprio nó como 1. */
export function heightOf(nodes: CategoryNode[], id: string): number {
  const children = nodes.filter((node) => node.parentId === id);

  if (children.length === 0) return 1;

  return 1 + Math.max(...children.map((child) => heightOf(nodes, child.id)));
}

/**
 * `true` quando `candidateId` está na subárvore de `ancestorId` — **incluindo**
 * o próprio nó. É o teste de ciclo: pendurar um nó em alguém que está abaixo
 * dele (ou nele mesmo) desconectaria o ramo da árvore.
 */
export function isInSubtreeOf(
  nodes: CategoryNode[],
  candidateId: string,
  ancestorId: string,
): boolean {
  if (candidateId === ancestorId) return true;

  const byId = new Map(nodes.map((node) => [node.id, node]));

  let current = byId.get(candidateId);
  let steps = 0;

  while (current?.parentId && steps <= nodes.length) {
    if (current.parentId === ancestorId) return true;

    current = byId.get(current.parentId);
    steps += 1;
  }

  return false;
}

/**
 * Ids do nó **mais** os de todos os seus descendentes — a expansão que o filtro
 * `?category=` da 9.8 usa (9.6/W2). Produto vincula a qualquer nó, folha ou
 * não, então "produtos de X" significa X e tudo abaixo dele; filtrar pelo nó
 * exato esconderia metade da vitrine.
 *
 * Nó ausente devolve lista vazia, e é o service que a traduz em "nenhum
 * produto": slug inexistente é filtro, não resolução de recurso (V2).
 *
 * A varredura é em largura com um `Set` de visitados — que é também o que
 * impede um ciclo já gravado no banco (as validações da 9.6 o impedem, mas o
 * laço não pode confiar nisso) de girar para sempre.
 */
export function subtreeIdsOf(nodes: CategoryNode[], rootId: string): string[] {
  if (!nodes.some((node) => node.id === rootId)) return [];

  const childrenOf = new Map<string, string[]>();

  for (const node of nodes) {
    if (!node.parentId) continue;

    const siblings = childrenOf.get(node.parentId) ?? [];
    siblings.push(node.id);
    childrenOf.set(node.parentId, siblings);
  }

  const collected = new Set<string>([rootId]);
  const queue = [rootId];

  while (queue.length > 0) {
    // O `shift` é seguro: a fila tem no máximo o tamanho da lista de nós.
    const current = queue.shift() as string;

    for (const child of childrenOf.get(current) ?? []) {
      if (collected.has(child)) continue;

      collected.add(child);
      queue.push(child);
    }
  }

  return [...collected];
}

type TreeRow = {
  id: string;
  parentId: string | null;
  position: number;
  name: string;
};

export type TreeNode<T extends TreeRow> = T & { children: TreeNode<T>[] };

/**
 * Aninha a lista plana em árvore, devolvendo só as raízes.
 *
 * Um nó cujo pai não está na lista sobe para o nível raiz em vez de sumir: isso
 * acontece quando o pai foi soft-deletado, e esconder o filho vivo seria pior —
 * a categoria existe, tem produtos, e ninguém a veria na vitrine.
 */
export function buildTree<T extends TreeRow>(rows: T[]): TreeNode<T>[] {
  const byId = new Map<string, TreeNode<T>>(
    rows.map((row) => [row.id, { ...row, children: [] }]),
  );

  const roots: TreeNode<T>[] = [];

  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;

    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortSiblings = (nodes: TreeNode<T>[]) => {
    nodes.sort(
      (a, b) => a.position - b.position || a.name.localeCompare(b.name),
    );

    for (const node of nodes) sortSiblings(node.children);
  };

  sortSiblings(roots);

  return roots;
}

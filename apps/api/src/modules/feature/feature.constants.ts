export const DEFAULT_FEATURES = [
  // User features
  { name: "create:user", description: "Criar uma conta" },
  { name: "read:user", description: "Ver o próprio perfil" },
  { name: "update:user", description: "Atualizar o próprio perfil" },
  { name: "delete:user", description: "Deletar a própria conta" },

  // Privileged user features
  { name: "read:user:others", description: "Ver qualquer usuário" },
  { name: "update:user:others", description: "Atualizar qualquer usuário" },
  { name: "delete:user:others", description: "Deletar qualquer usuário" },
  // Reativar uma conta soft-deletada. Sem par `:others` pelo mesmo motivo do
  // perfil de funcionário (D11/K13): quem está de fora não tem sessão nem
  // token, então nunca há self-service autenticado numa conta morta — o
  // caminho do próprio dono é o signup, que não passa por feature nenhuma.
  {
    name: "reactivate:user",
    description: "Reativar uma conta soft-deletada",
  },

  // Perfil de cliente — criar e reativar são features **separadas** (K12):
  // reativar traz de volta as roles que morreram na cascata, criar nasce com o
  // default. São poderes diferentes e ficam concedíveis/revogáveis em separado.
  // O nome diz o recurso (K13) — `create:profile` genérico não revelava que a
  // versão `:others` não alcança o perfil de funcionário.
  {
    name: "create:customer-profile",
    description: "Criar o próprio perfil de cliente",
  },
  {
    name: "reactivate:customer-profile",
    description: "Reativar o próprio perfil de cliente",
  },
  {
    name: "create:customer-profile:others",
    description: "Criar o perfil de cliente de outro usuário",
  },
  {
    name: "reactivate:customer-profile:others",
    description: "Reativar o perfil de cliente de outro usuário",
  },

  // Perfil de funcionário — nunca há self-service (D11), então não existe par
  // `:others`: estas já são as features de agir sobre outro.
  {
    name: "create:employee-profile",
    description: "Criar o perfil de funcionário de um usuário",
  },
  {
    name: "reactivate:employee-profile",
    description: "Reativar o perfil de funcionário de um usuário",
  },

  { name: "delete:profile", description: "Deletar um perfil de usuário" },

  // Session features
  { name: "read:session", description: "Ver as próprias sessões" },
  {
    name: "manage:session",
    description: "Gerenciar (encerrar) as próprias sessões",
  },

  // Feature management features
  { name: "read:feature", description: "Ler features do sistema" },

  // Role management features
  { name: "read:role", description: "Ler papéis do sistema" },

  // Permission management features
  { name: "read:permission", description: "Ler permissões de usuários" },
  { name: "manage:permission", description: "Gerenciar permissões" },

  // User status administration features
  { name: "manage:user:status", description: "Banir e desbanir usuários" },

  // Log reading features
  { name: "read:log", description: "Ler o buffer de logs em memória" },
  {
    name: "read:audit-log",
    description: "Ler a trilha de auditoria (IP mascarado)",
  },
  {
    name: "read:audit-log:full",
    description: "Ler a trilha de auditoria com o IP completo",
  },

  // Pet features (9.1) — o recorte é leitura × escrita, e não um verbo por
  // operação: sobre o próprio pet os quatro verbos andam sempre juntos, e a
  // fronteira que existe de verdade no balcão é "consultar a ficha" ×
  // "alterar a ficha". Marcar um pet como falecido é `manage:pet` comum.
  { name: "read:pet", description: "Ver os próprios pets" },
  {
    name: "manage:pet",
    description: "Criar, atualizar e excluir os próprios pets",
  },
  { name: "read:pet:others", description: "Ver os pets de qualquer cliente" },
  {
    name: "manage:pet:others",
    description: "Criar, atualizar e excluir pets de qualquer cliente",
  },

  // Catalog features (9.1) — não há feature de leitura pública: a vitrine
  // (`GET /products`, `/categories`, `/brands`, `/tags`, `/breeds`) responde
  // sem token. As features abaixo cobrem só o que está acima desse baseline.
  {
    name: "manage:product",
    description: "Gerenciar produtos, variantes e imagens do catálogo",
  },
  {
    name: "manage:catalog-structure",
    description: "Gerenciar marcas, categorias e tags do catálogo",
  },
  {
    name: "manage:stock",
    description: "Ajustar o estoque das variantes",
  },
  {
    name: "read:product:internal",
    description: "Ver rascunhos, descontinuados e o estoque exato do catálogo",
  },
  // Segredo comercial, mas **não** privilegiada: o guard de não-escalação
  // existe contra escalar o próprio sistema de permissão, e quem decide quem
  // vê margem é o gerente, não o admin.
  {
    name: "read:product:cost",
    description: "Ver o custo e a margem dos produtos",
  },

  // Wildcard feature
  { name: "*", description: "Acesso total a todas as funcionalidades" },
] as const;

export type FeatureName = (typeof DEFAULT_FEATURES)[number]["name"];

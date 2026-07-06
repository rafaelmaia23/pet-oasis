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

  // User profile administration features
  { name: "create:profile", description: "Criar um perfil de usuário" },
  { name: "delete:profile", description: "Deletar um perfil de usuário" },

  // Session features
  { name: "read:session", description: "Ver as próprias sessões" },
  { name: "manage:session", description: "Gerenciar (encerrar) as próprias sessões" },

  // Feature management features
  { name: "read:feature", description: "Ler features do sistema" },

  // Role management features
  { name: "read:role", description: "Ler papéis do sistema" },

  // Permission management features
  { name: "read:permission", description: "Ler permissões de usuários" },
  { name: "manage:permission", description: "Gerenciar permissões" },

  // Wildcard feature
  { name: "*", description: "Acesso total a todas as funcionalidades" },
] as const;

export type FeatureName = (typeof DEFAULT_FEATURES)[number]["name"];

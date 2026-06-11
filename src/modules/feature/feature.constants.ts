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

  // Session features
  { name: "logout:session", description: "Encerrar a própria sessão" },

  // Permission management features
  { name: "read:feature", description: "Ler features do sistema" },
  { name: "manage:feature", description: "Gerenciar features" },
] as const;

export type FeatureName = (typeof DEFAULT_FEATURES)[number]["name"];

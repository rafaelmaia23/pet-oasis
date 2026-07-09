import { ProfileKind } from "@/generated/prisma/enums";
import type { FeatureName } from "../feature/feature.constants";

type RoleDefinition = {
  name: string;
  description: string;
  features: FeatureName[];
  appliesTo: ProfileKind;
};

// Definição dos grupos semânticos de features
const SELF_MANAGEMENT_FEATURES: FeatureName[] = [
  "read:user",
  "update:user",
  "delete:user",
  "read:session",
  "manage:session",
];

const USER_ADMINISTRATION_FEATURES: FeatureName[] = [
  "create:user",
  "read:user:others",
  "update:user:others",
  "delete:user:others",
  "create:profile",
  "delete:profile",
  "manage:user:status",
];

export const PERMISSION_FEATURES: FeatureName[] = [
  "read:feature",
  "read:role",
  "read:permission",
  "manage:permission",
];

// Combinações de features para cada Role
const CUSTOMER_FEATURES: FeatureName[] = [
  ...new Set<FeatureName>([
    ...SELF_MANAGEMENT_FEATURES,
    // Outras features específicas para clientes podem ser adicionadas aqui
  ]),
];

const ATTENDANT_FEATURES: FeatureName[] = [
  ...new Set<FeatureName>([...SELF_MANAGEMENT_FEATURES]),
];

const MANAGER_FEATURES: FeatureName[] = [
  ...new Set<FeatureName>([
    ...SELF_MANAGEMENT_FEATURES,
    ...USER_ADMINISTRATION_FEATURES,
    ...PERMISSION_FEATURES,
  ]),
];

// Somente leitura — usuário público de demonstração da API hospedada
const DEMO_READ_FEATURES: FeatureName[] = [
  ...new Set<FeatureName>([
    "read:user",
    "read:user:others",
    "read:session",
    "read:feature",
    "read:role",
    "read:permission",
  ]),
];

// Definição dos Roles do sistema - cada role abaixo é o que o seed.ts irá sincronizar com o banco de dados
export const DEFAULT_ROLES = [
  {
    name: "customer",
    description: "Cliente padrão",
    features: CUSTOMER_FEATURES,
    appliesTo: ProfileKind.CUSTOMER,
  },
  {
    name: "attendant",
    description: "Atendente da loja",
    features: ATTENDANT_FEATURES,
    appliesTo: ProfileKind.EMPLOYEE,
  },
  {
    name: "manager",
    description: "Gerente da loja",
    features: MANAGER_FEATURES,
    appliesTo: ProfileKind.EMPLOYEE,
  },
  {
    name: "admin",
    description: "Administrador do sistema",
    features: ["*"],
    appliesTo: ProfileKind.EMPLOYEE,
  },
  {
    name: "demo",
    description: "Usuário de demonstração (somente leitura)",
    features: DEMO_READ_FEATURES,
    appliesTo: ProfileKind.EMPLOYEE,
  },
] as const satisfies readonly RoleDefinition[];

export type RoleName = (typeof DEFAULT_ROLES)[number]["name"];

export const ROLE_NAMES = DEFAULT_ROLES.map((r) => r.name) as [
  RoleName,
  ...RoleName[],
];

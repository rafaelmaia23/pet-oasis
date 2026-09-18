import {
  PERMISSION_FEATURES,
  PRIVILEGED_FEATURES,
} from "@pet-oasis/api-contracts/feature";
import { ROLE_NAMES, type RoleName } from "@pet-oasis/api-contracts/role";
import { ProfileKind } from "@/generated/prisma/enums";
import type { FeatureName } from "../feature/feature.constants";

// Os **nomes** de role e os conjuntos de features de permissão e privilegiadas
// são contrato (`@pet-oasis/api-contracts`): o web valida o nome que digita e
// a API checa a não-escalação sobre a mesma lista. O que fica aqui é o que só
// o seed precisa — a definição de cada role (descrição, features, a que perfil
// se aplica) e os grupos semânticos que a compõem.
export { PERMISSION_FEATURES, PRIVILEGED_FEATURES, ROLE_NAMES, type RoleName };

type RoleDefinition = {
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
  // Virar cliente é sempre self-service (§5.1). As duas moram aqui, e não em
  // `CUSTOMER_FEATURES`, por um motivo estrutural: a role `customer` morre
  // exatamente quando o perfil de cliente é deletado, então a feature sumiria no
  // instante em que passaria a ser necessária. No baseline ela chega pela role
  // de funcionário — que é quem sobrou vivo.
  "create:customer-profile",
  "reactivate:customer-profile",
];

// Atender um cliente no balcão sem ganhar poder nenhum sobre perfil de
// funcionário (K11) — é exatamente por isso que o nome diz o recurso.
const CUSTOMER_SERVICE_FEATURES: FeatureName[] = [
  "create:customer-profile:others",
  "reactivate:customer-profile:others",
];

// Pets do próprio cliente. Mora fora de `SELF_MANAGEMENT_FEATURES` porque só
// faz sentido para quem tem perfil de cliente — funcionário sem perfil de
// cliente não tem pet nenhum.
const PET_FEATURES: FeatureName[] = ["read:pet", "manage:pet"];

// Atender o cliente na ficha do pet dele, no mesmo espírito de
// `CUSTOMER_SERVICE_FEATURES`.
const PET_SERVICE_FEATURES: FeatureName[] = [
  "read:pet:others",
  "manage:pet:others",
];

// O que o repositor precisa: contar prateleira exige ver o estoque exato e os
// produtos que ainda não estão à venda.
const STOCK_FEATURES: FeatureName[] = ["read:product:internal", "manage:stock"];

// Autoria de catálogo. `manage:product` cobre produto, variante e imagem —
// variante não existe sem produto; `manage:catalog-structure` é separada
// porque reorganizar a árvore de categorias reclassifica a loja inteira.
const CATALOG_MANAGEMENT_FEATURES: FeatureName[] = [
  "manage:product",
  "manage:catalog-structure",
  "read:product:cost",
];

const USER_ADMINISTRATION_FEATURES: FeatureName[] = [
  "create:user",
  "read:user:others",
  "update:user:others",
  "delete:user:others",
  "reactivate:user",
  "create:employee-profile",
  "reactivate:employee-profile",
  "delete:profile",
  "manage:user:status",
];

// Leitura de log — features "normais" (concedíveis por override sem ser admin).
const LOG_READ_FEATURES: FeatureName[] = ["read:log", "read:audit-log"];

// Combinações de features para cada Role
const CUSTOMER_FEATURES: FeatureName[] = [
  ...new Set<FeatureName>([
    ...SELF_MANAGEMENT_FEATURES,
    ...PET_FEATURES,
    // Nenhuma feature de catálogo: a vitrine é pública, então não há o que
    // conceder ao cliente para ele ver produto.
  ]),
];

const ATTENDANT_FEATURES: FeatureName[] = [
  ...new Set<FeatureName>([
    ...SELF_MANAGEMENT_FEATURES,
    ...CUSTOMER_SERVICE_FEATURES,
    ...PET_SERVICE_FEATURES,
    // Vê o estoque exato para responder "tem em estoque?" no balcão, sem ver
    // custo e sem mexer no catálogo.
    "read:product:internal",
  ]),
];

const STOCKIST_FEATURES: FeatureName[] = [
  ...new Set<FeatureName>([...SELF_MANAGEMENT_FEATURES, ...STOCK_FEATURES]),
];

const CATALOG_MANAGER_FEATURES: FeatureName[] = [
  ...new Set<FeatureName>([
    ...SELF_MANAGEMENT_FEATURES,
    // Quem cadastra o produto também corrige contagem — a sobreposição com o
    // repositor é intencional.
    ...STOCK_FEATURES,
    ...CATALOG_MANAGEMENT_FEATURES,
  ]),
];

const MANAGER_FEATURES: FeatureName[] = [
  ...new Set<FeatureName>([
    ...SELF_MANAGEMENT_FEATURES,
    ...CUSTOMER_SERVICE_FEATURES,
    ...PET_SERVICE_FEATURES,
    ...USER_ADMINISTRATION_FEATURES,
    ...PERMISSION_FEATURES,
    ...LOG_READ_FEATURES,
    "read:audit-log:full",
    // Superconjunto do gerente de catálogo — o cargo existe para delegar, não
    // para tirar poder do gerente da loja.
    ...STOCK_FEATURES,
    ...CATALOG_MANAGEMENT_FEATURES,
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
    // Lê a trilha e o buffer — mas **não** `read:audit-log:full`: o demo vê o IP
    // mascarado (RBAC demonstrado dentro da própria resposta).
    ...LOG_READ_FEATURES,
    // Mesmo desenho aplicado ao domínio novo (9.1): o demo enxerga pets e a
    // visão interna do catálogo — sem `read:product:cost`, então a resposta
    // mostra ao vivo o campo sensível ausente pela whitelist do presenter.
    "read:pet:others",
    "read:product:internal",
  ]),
];

// Definição de cada role do sistema, pela chave do contrato. `Record<RoleName,
// …>` é a prova, no typecheck: role do contrato sem definição é chave faltando;
// definição sem role é propriedade em excesso.
const ROLE_DEFINITIONS: Record<RoleName, RoleDefinition> = {
  customer: {
    description: "Cliente padrão",
    features: CUSTOMER_FEATURES,
    appliesTo: ProfileKind.CUSTOMER,
  },
  attendant: {
    description: "Atendente da loja",
    features: ATTENDANT_FEATURES,
    appliesTo: ProfileKind.EMPLOYEE,
  },
  stockist: {
    description: "Repositor de estoque",
    features: STOCKIST_FEATURES,
    appliesTo: ProfileKind.EMPLOYEE,
  },
  "catalog-manager": {
    description: "Gerente de catálogo",
    features: CATALOG_MANAGER_FEATURES,
    appliesTo: ProfileKind.EMPLOYEE,
  },
  manager: {
    description: "Gerente da loja",
    features: MANAGER_FEATURES,
    appliesTo: ProfileKind.EMPLOYEE,
  },
  admin: {
    description: "Administrador do sistema",
    features: ["*"],
    appliesTo: ProfileKind.EMPLOYEE,
  },
  demo: {
    description: "Usuário de demonstração (somente leitura)",
    features: DEMO_READ_FEATURES,
    appliesTo: ProfileKind.EMPLOYEE,
  },
};

// O catálogo que o seed sincroniza com o banco, na ordem do contrato.
export const DEFAULT_ROLES = ROLE_NAMES.map((name) => ({
  name,
  ...ROLE_DEFINITIONS[name],
}));

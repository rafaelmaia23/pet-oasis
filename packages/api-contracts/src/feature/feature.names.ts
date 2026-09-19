import { z } from "zod";

// Os nomes de feature são contrato: o web esconde um botão por feature efetiva sem
// digitar a string, e a API os usa em `can`/`hasFeature`. A **lista** de nomes
// mora aqui; o que cada uma significa (descrição, semeada no banco) e quais
// roles a carregam ficam na API — é dado de seed, não contrato. A ordem é a do
// catálogo da API: o seed percorre esta tupla.
//
// Convenção de nome: `verbo:recurso[:qualificador]`. `:others` é agir sobre o
// recurso de outro usuário; sem sufixo é o próprio. Só `read:*` não concede
// escrita — é o que mantém a role `demo` (credencial pública) somente leitura.
export const FEATURE_NAMES = [
  // User
  "create:user",
  "read:user",
  "update:user",
  "delete:user",
  "read:user:others",
  "update:user:others",
  "delete:user:others",
  "reactivate:user",

  // Perfil de cliente — criar e reativar são poderes separados
  "create:customer-profile",
  "reactivate:customer-profile",
  "create:customer-profile:others",
  "reactivate:customer-profile:others",

  // Perfil de funcionário — nunca há self-service, então não existe `:others`
  "create:employee-profile",
  "reactivate:employee-profile",

  "delete:profile",

  // Session
  "read:session",
  "manage:session",

  // Feature, role e permission — o sistema de permissão em si
  "read:feature",
  "read:role",
  "read:permission",
  "manage:permission",

  // Status de usuário (banir/desbanir)
  "manage:user:status",

  // Logs — `read:audit-log` vê o IP mascarado; `:full` vê o IP inteiro
  "read:log",
  "read:audit-log",
  "read:audit-log:full",

  // Pet — leitura × escrita, próprio × `:others`
  "read:pet",
  "manage:pet",
  "read:pet:others",
  "manage:pet:others",

  // Catálogo — a vitrine é pública; estas cobrem só o que está acima disso
  "manage:product",
  "manage:catalog-structure",
  "manage:stock",
  "read:product:internal",
  "read:product:cost",

  // Wildcard: admin pode tudo
  "*",
] as const;

export type FeatureName = (typeof FEATURE_NAMES)[number];

export const featureNameSchema = z.enum(FEATURE_NAMES);

// As features do próprio sistema de permissão. É o que faz de uma role um
// alvo privilegiado (ter qualquer uma delas, ou `*`) e é a base do conjunto
// de não-escalação abaixo — derivado, não copiado, para que acrescentar uma
// aqui a torne privilegiada por construção.
export const PERMISSION_FEATURES = [
  "read:feature",
  "read:role",
  "read:permission",
  "manage:permission",
] as const satisfies readonly FeatureName[];

// Não-escalação: conceder uma destas por override — ou atribuir uma role que
// a contenha — exige role **admin**, não só a feature `manage:permission`. São
// as features que escalam o próprio sistema de permissão, mais
// `read:audit-log:full`, que destrava o IP inteiro no audit log (dado
// semi-sensível). Custo/margem (`read:product:cost`) é segredo comercial, não
// escalação: fica de fora de propósito.
export const PRIVILEGED_FEATURES = [
  ...PERMISSION_FEATURES,
  "read:audit-log:full",
] as const satisfies readonly FeatureName[];

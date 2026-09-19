import {
  FEATURE_NAMES,
  type FeatureName,
} from "@pet-oasis/api-contracts/feature";

// A **lista** de features é contrato (`@pet-oasis/api-contracts/feature`): é o
// que o web usa para esconder um botão por capability. O que fica aqui é o que
// só o seed precisa — a descrição de cada uma. `Record<FeatureName, string>` é
// a prova, no typecheck: feature do contrato sem descrição é chave faltando;
// descrição sem feature é propriedade em excesso. Os dois lados não divergem
// em silêncio.
export { FEATURE_NAMES, type FeatureName };

const FEATURE_DESCRIPTIONS: Record<FeatureName, string> = {
  // User features
  "create:user": "Criar uma conta",
  "read:user": "Ver o próprio perfil",
  "update:user": "Atualizar o próprio perfil",
  "delete:user": "Deletar a própria conta",

  // Privileged user features
  "read:user:others": "Ver qualquer usuário",
  "update:user:others": "Atualizar qualquer usuário",
  "delete:user:others": "Deletar qualquer usuário",
  // Reativar uma conta soft-deletada. Sem par `:others` pelo mesmo motivo do
  // perfil de funcionário (D11/K13): quem está de fora não tem sessão nem
  // token, então nunca há self-service autenticado numa conta morta — o
  // caminho do próprio dono é o signup, que não passa por feature nenhuma.
  "reactivate:user": "Reativar uma conta soft-deletada",

  // Perfil de cliente — criar e reativar são features **separadas** (K12):
  // reativar traz de volta as roles que morreram na cascata, criar nasce com o
  // default. São poderes diferentes e ficam concedíveis/revogáveis em separado.
  // O nome diz o recurso (K13) — `create:profile` genérico não revelava que a
  // versão `:others` não alcança o perfil de funcionário.
  "create:customer-profile": "Criar o próprio perfil de cliente",
  "reactivate:customer-profile": "Reativar o próprio perfil de cliente",
  "create:customer-profile:others":
    "Criar o perfil de cliente de outro usuário",
  "reactivate:customer-profile:others":
    "Reativar o perfil de cliente de outro usuário",

  // Perfil de funcionário — nunca há self-service (D11), então não existe par
  // `:others`: estas já são as features de agir sobre outro.
  "create:employee-profile": "Criar o perfil de funcionário de um usuário",
  "reactivate:employee-profile":
    "Reativar o perfil de funcionário de um usuário",

  "delete:profile": "Deletar um perfil de usuário",

  // Session features
  "read:session": "Ver as próprias sessões",
  "manage:session": "Gerenciar (encerrar) as próprias sessões",

  // Feature management features
  "read:feature": "Ler features do sistema",

  // Role management features
  "read:role": "Ler papéis do sistema",

  // Permission management features
  "read:permission": "Ler permissões de usuários",
  "manage:permission": "Gerenciar permissões",

  // User status administration features
  "manage:user:status": "Banir e desbanir usuários",

  // Log reading features
  "read:log": "Ler o buffer de logs em memória",
  "read:audit-log": "Ler a trilha de auditoria (IP mascarado)",
  "read:audit-log:full": "Ler a trilha de auditoria com o IP completo",

  // Pet features (9.1) — o recorte é leitura × escrita, e não um verbo por
  // operação: sobre o próprio pet os quatro verbos andam sempre juntos, e a
  // fronteira que existe de verdade no balcão é "consultar a ficha" ×
  // "alterar a ficha". Marcar um pet como falecido é `manage:pet` comum.
  "read:pet": "Ver os próprios pets",
  "manage:pet": "Criar, atualizar e excluir os próprios pets",
  "read:pet:others": "Ver os pets de qualquer cliente",
  "manage:pet:others": "Criar, atualizar e excluir pets de qualquer cliente",

  // Catalog features (9.1) — não há feature de leitura pública: a vitrine
  // (`GET /products`, `/categories`, `/brands`, `/tags`, `/breeds`) responde
  // sem token. As features abaixo cobrem só o que está acima desse baseline.
  "manage:product": "Gerenciar produtos, variantes e imagens do catálogo",
  "manage:catalog-structure": "Gerenciar marcas, categorias e tags do catálogo",
  "manage:stock": "Ajustar o estoque das variantes",
  "read:product:internal":
    "Ver rascunhos, descontinuados e o estoque exato do catálogo",
  // Segredo comercial, mas **não** privilegiada: o guard de não-escalação
  // existe contra escalar o próprio sistema de permissão, e quem decide quem
  // vê margem é o gerente, não o admin.
  "read:product:cost": "Ver o custo e a margem dos produtos",

  // Wildcard feature
  "*": "Acesso total a todas as funcionalidades",
};

// O catálogo que o seed sincroniza com o banco, na ordem do contrato.
export const DEFAULT_FEATURES = FEATURE_NAMES.map((name) => ({
  name,
  description: FEATURE_DESCRIPTIONS[name],
}));

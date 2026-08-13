/// <reference types="zod-openapi" />
import { createDocument, type ZodOpenApiObject } from "zod-openapi";
import { securitySchemes } from "./components";
import { auditLogPaths } from "./paths/audit-log";
import { authPaths } from "./paths/auth";
import { featurePaths } from "./paths/feature";
import { logPaths } from "./paths/log";
import { mePaths } from "./paths/me";
import { permissionPaths } from "./paths/permission";
import { profilePaths } from "./paths/profile";
import { rolePaths } from "./paths/role";
import { statusPaths } from "./paths/status";
import { userPaths } from "./paths/user";

type OpenApiDocument = ReturnType<typeof createDocument>;

/**
 * Primeira dobra da referência Scalar — renderizada como markdown. É a porta de
 * entrada do projeto (o README aponta para cá), então o roteiro do usuário demo
 * vem antes da lista de recursos: o visitante autentica e vê o RBAC decidir
 * antes de perder o interesse.
 */
const INTRODUCTION = `
API REST de um pet shop online — **autenticação, autorização RBAC e gestão de usuários construídas do zero, com TDD.**

Este documento é gerado a partir dos próprios schemas Zod que validam as requisições em runtime: a documentação não tem como divergir da implementação, porque *é* a implementação.

## Experimente em 30 segundos

Existe um usuário público **read-only** com permissão de leitura de administrador — enxerga tudo, não altera nada:

| Email | Senha |
|---|---|
| \`demo@petoasis.dev\` | \`DemoOasis2026!\` |

1. Chame **\`POST /auth/login\`** com essas credenciais e copie o \`accessToken\` da resposta.
2. Cole no botão **Authorize**, no topo da página. A partir daí todas as chamadas vão autenticadas.
3. Provoque o motor de permissões:
   - \`GET /users\` → **200**, a lista inteira de usuários.
   - \`GET /users/{userId}/permissions\` → **200**, as features efetivas daquele usuário.
   - \`DELETE /users/{id}\` → **403**, nomeando a ação exigida.

O **403 não é um endpoint travado**: é o RBAC calculando, em runtime, que a role \`demo\` agrega features de leitura e nenhuma de escrita. Trocar a role do usuário muda a resposta — sem tocar em uma linha de código.

> Prefere criar sua própria conta? \`POST /auth/signup\` dispara um email de verificação real. O passo a passo está no [README do projeto](https://github.com/rafaelmaia23/pet-oasis).

## O que está aqui dentro

- **Autenticação** — access token JWT de 15 min validado por assinatura, sem ida ao banco a cada request; refresh token opaco e rotativo em cookie \`httpOnly\`, guardado apenas como hash. Se um refresh já consumido reaparece, *todas* as sessões do usuário morrem na hora.
- **Autorização** — roles agregam features; overrides guardam só exceções (grant/deny), nunca cópias. As features efetivas saem de uma função pura: \`(⋃ roles ∪ grants) − denies\`. Autorização sempre antes da busca — **403 vence 404**, para o código de erro não virar oráculo de existência.
- **Usuários e perfis** — CRUD com soft delete preservando histórico; perfis (*customer* / *employee*) definidos pela presença da relação, não por um campo "tipo"; roles validadas contra o perfil.
- **Ciclo de vida da conta** — verificação de email, recuperação e troca de senha, banimento. Endpoints públicos sensíveis respondem sempre igual, existindo o email ou não.

## Como ler esta referência

- Cada operação nomeia a **feature exigida** no próprio resumo (*exige \`read:user:others\`*) — dá para mapear a superfície de permissões só percorrendo a sidebar.
- Todos os erros compartilham um envelope único; \`422\` traz os detalhes por campo.
- As respostas passam por *presenters* com whitelist declarada em Zod: senhas e tokens não vazam porque nunca estão na lista.

---

**Projeto de portfólio, aberto e documentado.** O *porquê* de cada decisão vive no [repositório no GitHub](https://github.com/rafaelmaia23/pet-oasis) — README, ADRs e um \`docs/context/\` com o raciocínio longo.

Feito por [Rafael Maia da Fonseca](https://www.linkedin.com/in/rafaelmaiadafonseca).
`.trim();

const documentDefinition: ZodOpenApiObject = {
  openapi: "3.1.0",
  info: {
    title: "Pet Oasis API",
    version: "1.0.0",
    description: INTRODUCTION,
    contact: {
      name: "Rafael Maia da Fonseca",
      url: "https://github.com/rafaelmaia23/pet-oasis",
    },
    license: { name: "MIT", identifier: "MIT" },
  },
  servers: [{ url: "/api/v1", description: "API v1" }],
  tags: [
    {
      name: "Status",
      description:
        "Health check público — responde sem autenticação e sem tocar no banco.",
    },
    {
      name: "Auth",
      description:
        "Signup, login, verificação de email, recuperação de senha e o ciclo " +
        "de sessões. O access token é um JWT curto; o refresh é opaco, " +
        "rotativo e vive num cookie `httpOnly`.",
    },
    {
      name: "Me",
      description:
        "O usuário autenticado sobre si mesmo — perfil, roles e a lista de " +
        "features efetivas calculadas para ele.",
    },
    {
      name: "Users",
      description:
        "CRUD de usuários e banimento. Soft delete em toda parte: nada some " +
        "do banco, o histórico fica íntegro para auditoria.",
    },
    {
      name: "Profiles",
      description:
        "Perfis *customer* e *employee* de um usuário. O perfil é definido " +
        'pela presença da relação, não por um campo "tipo"; criação e ' +
        "remoção rodam em transação e o último perfil ativo não pode ser " +
        "removido.",
    },
    {
      name: "Permissions",
      description:
        "Vínculos com roles e overrides de feature por usuário. Overrides " +
        "guardam só exceções (grant/deny) — as features efetivas são " +
        "computadas em runtime, nunca materializadas.",
    },
    {
      name: "Roles",
      description:
        "Catálogo de papéis, somente leitura. As roles são definidas em " +
        "código e semeadas; só o vínculo usuário↔role é gerenciável pela API.",
    },
    {
      name: "Features",
      description:
        "Catálogo de features, somente leitura. É a lista fechada de tudo " +
        "que se pode autorizar no sistema.",
    },
    {
      name: "Audit",
      description:
        "Trilha durável de ações sensíveis (append-only, só leitura). " +
        "Paginação por cursor; o IP sai mascarado sem `read:audit-log:full`.",
    },
    {
      name: "Logs",
      description:
        "Buffer de logs em memória do processo — volátil e por réplica. " +
        "Leitura via `read:log`.",
    },
  ],
  components: { securitySchemes },
  // Bearer por padrão; operações públicas sobrescrevem com `security: []`.
  security: [{ bearerAuth: [] }],
  paths: {
    ...statusPaths,
    ...authPaths,
    ...mePaths,
    ...userPaths,
    ...profilePaths,
    ...permissionPaths,
    ...rolePaths,
    ...featurePaths,
    ...auditLogPaths,
    ...logPaths,
  },
};

let cachedDocument: OpenApiDocument | undefined;

export function buildOpenApiDocument(): OpenApiDocument {
  if (!cachedDocument) {
    cachedDocument = createDocument(documentDefinition);
  }
  return cachedDocument;
}

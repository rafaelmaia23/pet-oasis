<div align="center">

# 🐾 Pet Oasis

**API REST de um pet shop online - autenticação, autorização RBAC e gestão de usuários construídas do zero, com TDD.**

[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-22-5FA04E?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Zod](https://img.shields.io/badge/Zod-4-3E67B1?logo=zod&logoColor=white)](https://zod.dev/)
[![Vitest](https://img.shields.io/badge/Vitest-606%20testes-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![OpenAPI](https://img.shields.io/badge/OpenAPI-3.1-6BA539?logo=openapiinitiative&logoColor=white)](https://spec.openapis.org/oas/v3.1.0)
[![License](https://img.shields.io/badge/license-MIT-blue)](#licença)

### [🚀 Explorar a API ao vivo](https://pet-oasis.maiahub.com.br)

*Documentação interativa, com "try it" — sem instalar nada.*

<br>

<!-- Demonstração: login com o usuário demo → GET /users (200) → DELETE /users/:id (403) -->
<img src="docs/assets/demo.gif" alt="Login com o usuário demo na referência Scalar: leitura responde 200, escrita responde 403" width="820">

</div>

---

## O que é

Uma API REST de pet shop levada a sério: modelagem de domínio, camadas rígidas, testes escritos antes do código e cada decisão de arquitetura registrada por escrito.

O projeto tem dois propósitos que se reforçam. É uma **aplicação real** — a fundação de autenticação, autorização e gestão de usuários já está completa e no ar. E é um **veículo de aprendizado deliberado** de TDD e clean code: nenhuma feature entra sem teste que a guie, e o *porquê* de cada escolha vive em [`docs/context.md`](docs/context.md) e nos [ADRs](docs/adr/), não só na cabeça de quem escreveu.

O **Ciclo 1** — a fundação — está concluído: autenticação com refresh rotativo, RBAC com overrides por usuário, perfis, verificação de email, banimento e recuperação de senha. O **Ciclo 2** abre o domínio do pet shop em si.

---

## 🚀 Experimente agora

A API está no ar em **[pet-oasis.maiahub.com.br](https://pet-oasis.maiahub.com.br)** (que redireciona direto para a referência interativa).

| Recurso | Link |
|---|---|
| 📖 Referência interativa ([Scalar](https://scalar.com), com "try it") | **[/reference](https://pet-oasis.maiahub.com.br/reference)** |
| 📄 Spec OpenAPI 3.1 (gerada dos próprios schemas Zod) | [/openapi.json](https://pet-oasis.maiahub.com.br/openapi.json) |
| ❤️ Health check | [/api/v1/status](https://pet-oasis.maiahub.com.br/api/v1/status) |

Ambas as rotas de documentação são públicas. Abaixo, dois roteiros para ver o sistema funcionando de verdade — não só a lista de endpoints.

<br>

### 🅰️ Roteiro A — ver o RBAC decidindo, ao vivo (30 segundos)

Existe um usuário público **read-only** com permissão de leitura de *administrador*: ele enxerga tudo, e não pode alterar nada.

| Campo | Valor |
|---|---|
| Email | `demo@petoasis.dev` |
| Senha | `DemoOasis2026!` |

O ambiente demo é resetado diariamente às **04:00 UTC** (dados de teste voltam ao estado inicial) — é higiene do deploy de portfólio, não o que garante o read-only (isso é o RBAC acima).

1. Abra a **[referência interativa](https://pet-oasis.maiahub.com.br/reference)**.
2. Chame `POST /auth/login` com as credenciais acima e copie o `accessToken` da resposta.
3. Cole o token no botão **Authorize** (canto superior) — a partir daí todas as chamadas vão autenticadas.
4. Agora provoque a autorização:
   - `GET /users` → **200**, a lista inteira de usuários.
   - `GET /users/:id/permissions` → **200**, as features efetivas daquele usuário.
   - `DELETE /users/:id` → **403**, com mensagem e ação sugerida.

O 403 não é um endpoint travado: é o mesmo motor de permissões calculando, em runtime, que a role `demo` agrega features de leitura e nenhuma de escrita. Trocar a role do usuário muda a resposta — sem tocar em uma linha de código.

<details>
<summary><b>Prefere o terminal?</b></summary>

```bash
BASE=https://pet-oasis.maiahub.com.br/api/v1

TOKEN=$(curl -s -X POST $BASE/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@petoasis.dev","password":"DemoOasis2026!"}' \
  | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)

curl -s $BASE/users -H "Authorization: Bearer $TOKEN" -o /dev/null -w "GET  /users → %{http_code}\n"
curl -s -X DELETE $BASE/users/qualquer-id -H "Authorization: Bearer $TOKEN" -o /dev/null -w "DEL  /users → %{http_code}\n"
```

</details>

<br>

### 🅱️ Roteiro B — criar sua própria conta, do zero ao `/me`

O ciclo completo de onboarding funciona ponta a ponta em produção, com email real (via [Resend](https://resend.com)).

1. **`POST /auth/signup`** — nome, CPF, email, telefone e senha. Nasce um usuário com perfil *customer*, role `customer` e status **`PENDING`**.
2. **Confira seu email.** Chega uma mensagem de verificação com um link.

   > ℹ️ **O link vai levar a uma página que não existe — e isso é esperado.** Este projeto é **backend-only**; o front que consumiria a API ainda não foi escrito, e o link aponta para a rota que ele *terá*. Copie o valor do parâmetro `token` da URL:
   >
   > `…/verify-email?token=`**`7ce85bee0368…`** ← é essa parte que você usa.

3. **`POST /auth/verify-email`** com `{ "token": "<o token copiado>" }` → **204**. Sua conta vira **`ACTIVE`**.
4. **`POST /auth/login`** → recebe o `accessToken` (JWT de 15 min) e um cookie httpOnly com o refresh token.
5. **`GET /me`** → seu perfil, suas roles e a lista de features efetivas calculadas para você.

Dali em diante dá para explorar o resto: `GET /auth/sessions` lista suas sessões vivas, `POST /auth/refresh` rotaciona o par de tokens, `POST /auth/change-password` troca a senha e derruba todas as sessões, `DELETE /auth/sessions/:id` revoga uma sessão específica.

> Tentar `GET /users` com essa conta responde **403** — um cliente não tem `read:user:others`. É o RBAC de novo, agora do outro lado do balcão.

---

## O que a API faz hoje

<table>
<tr><td width="50%" valign="top">

### 🔐 Autenticação
- **Access token JWT** (15 min), validado localmente por assinatura — sem ida ao banco a cada request.
- **Refresh token opaco e rotativo**, guardado apenas como hash, em cookie httpOnly. Cada rotação queima o anterior.
- **Detecção de roubo por reuso**: se um refresh já consumido reaparece, *todas* as sessões do usuário morrem na hora.
- Sessões vivas listáveis e revogáveis individualmente.
- Respostas propositalmente genéricas nos caminhos de falha — não vazam qual checagem falhou.

</td><td width="50%" valign="top">

### 🛡️ Autorização (RBAC + overrides)
- **Roles agregam features**; são definidas em código e semeadas (`customer`, `attendant`, `manager`, `admin`, `demo`).
- **`UserFeature` guarda só exceções** — grant ou deny por usuário, nunca cópias do conjunto da role.
- Features efetivas computadas em runtime por uma função pura: `(⋃ roles ∪ grants) − denies`, com `*` = admin.
- **Não-escalação**: mexer nas features de permissão exige ser admin de fato, não só ter a feature.
- **Autorização antes da busca** — 403 vence 404, para não usar o código de erro como oráculo de existência.

</td></tr>
<tr><td width="50%" valign="top">

### 👤 Usuários e perfis
- CRUD completo, com **soft delete** preservando histórico para auditoria.
- Todo usuário tem ao menos um perfil (*customer* e/ou *employee*), definido pela presença da relação — não por um campo "tipo".
- Perfis criados/removidos em transação; o último perfil ativo não pode ser removido.
- Roles são validadas contra o perfil (`appliesTo`): não dá para dar a role `manager` a quem não é funcionário.

</td><td width="50%" valign="top">

### ✉️ Ciclo de vida da conta
- **Verificação de email obrigatória**: `PENDING → ACTIVE`, com reenvio.
- **Recuperação de senha** por token de uso único, e troca de senha logado exigindo a senha atual — ambas invalidam todas as sessões.
- **Banimento** ortogonal ao status (`bannedAt`/`bannedBy`/`banReason`), derrubando as sessões do alvo.
- Endpoints públicos sensíveis respondem sempre igual, existindo o email ou não (sem enumeração de contas).

</td></tr>
</table>

📋 O índice completo de rotas está em [`docs/endpoints.md`](docs/endpoints.md) — e o contrato formal, sempre atualizado, é o próprio [`/openapi.json`](https://pet-oasis.maiahub.com.br/openapi.json).

---

## Como foi construído

### Camadas rígidas, sem atalhos

```
route → controller (parse Zod) → service (regras de negócio) → repository (Prisma)
                                                                      ↓
                                                        presenter (whitelist Zod)
```

Cada camada só conversa com a adjacente. O **repository** é a única que toca o Prisma; o **controller** só valida a entrada, chama o service e responde; o **service** concentra as regras. O **presenter** monta cada view por whitelist declarada em Zod — `passwordHash` e `tokenHash` não têm como vazar, porque nunca estão na lista.

### Decisões que valem o olhar

| Decisão | Por quê |
|---|---|
| Access JWT curto + refresh opaco rotativo | Elimina a consulta ao banco em todo request autenticado, sem abrir mão de poder revogar sessões. |
| `authenticate` por grupo de rota, não global | Um middleware global derrubava `/auth/refresh` com 401 — justamente o endpoint cujo propósito é recuperar acesso com o access token expirado. |
| Features efetivas computadas, nunca materializadas | Mudar a role de alguém reflete no próximo request; não existe estado duplicado para sair de sincronia. |
| Soft delete em usuários, perfis e vínculos | Vendas e pedidos (Ciclo 2) precisam do histórico íntegro — quem atendeu, com qual permissão, quando. |
| Erros por *factory*, `throw` explícito no call site | Sem controle de fluxo escondido: dá para ler o service e saber exatamente onde a requisição termina. |
| OpenAPI gerado dos schemas Zod | Fonte única de verdade. A doc não tem como divergir da validação, porque é a validação. |

O raciocínio longo de cada uma está em [`docs/context.md`](docs/context.md); as decisões estruturais viraram [ADRs](docs/adr/).

### Testes antes do código

Toda feature nasce de um teste que falha. A suíte tem **606 testes** (Vitest + Supertest + Faker) rodando contra um Postgres e um Redis reais e isolados, subidos e derrubados pelo próprio `npm test` — integração de verdade, não mocks de banco ou de infra. `tsc --noEmit` e Biome fazem parte do fecho de qualquer tarefa.

### Disciplina de processo

Cada fase do roadmap tem sua branch, cada feature a sua, e nada é desenvolvido direto na `main`. O estado e a ordem das tarefas vivem em [`docs/todo.md`](docs/todo.md); os commits são atômicos e descrevem a mudança, não o arquivo.

---

## Rodar localmente

Sobe inteiro com Docker — banco, Redis, mail-catcher e app com hot-reload:

```bash
git clone https://github.com/rafaelmaia23/pet-oasis.git && cd pet-oasis
cp .env.example .env.development   # preencha JWT_SECRET e PEPPER (≥ 32 chars cada)
npm run dev
```

API em `http://localhost:3000/api/v1`, referência interativa em `/reference` e os emails de verificação caindo no [Mailpit](https://mailpit.axllent.org/) em `http://localhost:8025`.

📘 **Passo a passo completo, comandos e fluxo de contribuição:** [`docs/dev.md`](docs/dev.md)
🚢 **Deploy em produção (VPS ARM64, Compose por ambiente):** [`docs/deploy.md`](docs/deploy.md)

Há também uma coleção [Bruno](https://www.usebruno.com/) versionada em [`api-collection/`](api-collection/), organizada por módulo, com environments `local` e `prod` e o login já encadeando o token nas demais requests.

---

## Roadmap

**Ciclo 1 — Fundação** ✅ *concluído*

| | Fase | Entrega |
|---|---|---|
| ✅ | 2 | Autorização RBAC, CRUD de usuários e perfis |
| ✅ | 3 | Auth com access JWT + refresh opaco rotativo |
| ✅ | 4 | Email, status de conta, recuperação de senha e banimento |
| ✅ | 5 | OpenAPI + Scalar, coleção Bruno, containerização |
| ✅ | 6 | Ambientes dev/test/prod, deploy e graceful shutdown |
| ✅ | 7 | Hardening: rate limiting, account lockout, observabilidade (access/application/audit log), paginação e filtros, teto de sessões, troca de email, timeouts |

**A seguir**

| | Fase | Entrega |
|---|---|---|
| 🔜 | 8 — Domínio pet shop | Pets ligados a Customers, CRUD aninhado, escopos *own*/*others* — e, adiante, vendas e pedidos |

Detalhe atômico de cada item em [`docs/todo.md`](docs/todo.md).

---

## Documentação do projeto

| Arquivo | Conteúdo |
|---|---|
| [`docs/context.md`](docs/context.md) | O *porquê* de cada decisão — o documento mais denso do repo |
| [`docs/endpoints.md`](docs/endpoints.md) | Índice enxuto de todas as rotas, com a permissão exigida por cada uma |
| [`docs/todo.md`](docs/todo.md) | Roadmap por fase, no nível da tarefa |
| [`docs/adr/`](docs/adr/) | Architecture Decision Records das escolhas estruturais |
| [`CLAUDE.md`](CLAUDE.md) | Convenções do projeto, escritas para orientar assistência de IA |
| [`docs/dev.md`](docs/dev.md) · [`docs/deploy.md`](docs/deploy.md) | Ambiente de desenvolvimento e procedimento de deploy |

---

## Licença

MIT — veja [LICENSE](LICENSE).

---

<div align="center">

Feito com cuidado por **Rafael Maia da Fonseca**

[![GitHub](https://img.shields.io/badge/GitHub-rafaelmaia23-181717?logo=github&logoColor=white)](https://github.com/rafaelmaia23)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-conectar-0A66C2?logo=linkedin&logoColor=white)](https://www.linkedin.com/in/rafaelmaiadafonseca)

</div>
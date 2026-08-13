# pet-oasis — Índice do contexto

> **Não leia este documento inteiro, e não leia todos os arquivos que ele lista.** Ele é um
> roteador: ache no índice a decisão de que você precisa, abra **só** o arquivo dela. Uma sessão
> de trabalho típica lê este índice e um ou dois arquivos temáticos.
>
> O essencial acionável está no `CLAUDE.md`; o estado das tarefas no [`todo.md`](todo.md); as
> decisões estruturais nos [ADRs](adr/). Aqui fica o *porquê* longo de cada escolha.

---

## Onde está cada coisa

| Arquivo | Abra quando o assunto for |
|---|---|
| [`context/authorization.md`](context/authorization.md) | RBAC, features, overrides escopados, não-escalação, quem pode o quê |
| [`context/lifecycle.md`](context/lifecycle.md) | soft delete, cascata de deleção, restauração, reativação de conta ou perfil |
| [`context/identity-and-sessions.md`](context/identity-and-sessions.md) | login, JWT/refresh, status de conta, ban, verificação e troca de email, senha |
| [`context/api-contracts.md`](context/api-contracts.md) | o que a API devolve: views, status de erro, validação, paginação, tipos |
| [`context/architecture.md`](context/architecture.md) | camadas, roteamento, em que arquivo uma responsabilidade nova deve morar |
| [`context/security.md`](context/security.md) | rate limit, lockout, Redis, CSP/CORS/helmet, limites de corpo |
| [`context/observability.md`](context/observability.md) | logs, audit trail, Axiom/Sentry, ring buffer, timeouts |
| [`context/infrastructure.md`](context/infrastructure.md) | Compose e ambientes, deploy, imagem, OpenAPI/Scalar/Bruno, seeds e demo |
| [`context/pet-domain.md`](context/pet-domain.md) | Ciclo 2 — pets e catálogo (quase só ponteiros para os ADRs) |
| [`context/schema.md`](context/schema.md) | por que uma coluna é assim, o que cada migration mudou, invariantes |
| [`context/history.md`](context/history.md) | narrativa de o que cada fase entregou — **leitura rara** |

Documentos irmãos, que são fonte única do que cobrem (não duplicar aqui):
[`reference/logging-policy.md`](reference/logging-policy.md) (categorias de log, taxonomia de
audit, dados proibidos, retenção), [`reference/endpoints.md`](reference/endpoints.md) (índice de
rotas), [`reference/backlog.md`](reference/backlog.md) (o que ficou de fora e por quê) e os
[ADRs](adr/).

---

## Índice de decisões

Uma linha por decisão registrada. O título é a decisão; o arquivo linkado tem o argumento
completo, os contra-argumentos e os gotchas.

### [Autorização](context/authorization.md)

*Ordem e forma da checagem*

- Autorização sempre antes da busca
- Autorização em duas etapas quando o ramo depende do banco
- Cômputo em dois laços, não um aninhado

*Não-escalação*

- A âncora é a role admin, não a feature
- O guard vale para roles, não só para overrides
- Furo fechado na 8.3 — nascer com a role é ser atribuído a ela
- Nos três guards, o alvo é o mesmo conceito

*Escopo do override*

- O override pendura na atribuição de role, não no usuário (D2)
- Uma linha por `(userId, roleId)` para sempre (D3)
- A role vai no path (D9)
- 422 no `PUT` sem a role ativa, mas 404 no `DELETE`
- `DELETE` de override sem override ativo → 404, não 204
- Consequência na view

*Vínculo user↔role*

- Perfis vêm antes de user↔role
- `POST` orienta, não cria perfil
- `DELETE` protege o último vínculo do perfil
- Roles default na criação

*Catálogo de features*

- O nome diz o recurso (`create:customer-profile`, não `create:profile`)
- `reactivate:*` é feature separada de `create:*` (K12)
- `create:`/`reactivate:customer-profile` moram em `SELF_MANAGEMENT_FEATURES`
- `read:audit-log:full` entrou em `PRIVILEGED_FEATURES`

### [Ciclo de vida](context/lifecycle.md)

*Soft delete*

- Por que `UserFeature`/`UserRole` também têm soft delete
- A cascata é escrita à mão, não pelo banco
- Um único `new Date()` por transação (D4)

*Restauração*

- Correlação por data, não por coluna de "motivo" (D5)
- A restauração para na role (D6')
- O nível `User` → perfil deixou de correlacionar (K20)
- Os três níveis nasceram como primitivas de repositório (K7)
- `grantRolesToUser` nasceu como primitiva

*Perfil — os fluxos de produto*

- A mesma rota cria e reativa (8.3)
- `roleNames` é "com que roles o perfil volta", não filtro

*Conta — deleção e reativação*

- A reativação exige senha nova (K17)
- O signup que dispara reativação responde 202 (K18)
- O admin não reativa nada sozinho
- O `phone` é pedido na confirmação, não no pedido (K23)
- O guard corre sobre as roles que vão voltar (K22)

### [Identidade e sessões](context/identity-and-sessions.md)

*Sessão e refresh*

- Design de `Session` — access JWT 15min + refresh opaco rotativo
- Ordem de checagem no `refresh`: reuso → invalidada → expirada
- Refresh token hasheado em repouso — item que virou teste, não código
- Teto de sessões vivas

*Status da conta*

- Status e ban são ortogonais
- Todo usuário nasce PENDING, inclusive os criados por admin
- 403 (não 401) no login quando a senha está certa mas a conta não está ACTIVE
- Anti-enumeração em forgot / resend / signup

*Ban — a conta congelada*

- Ban reusa a âncora admin da não-escalação
- O guard do ban difere do de role, e auto-ban é 409
- "Conta congelada" cobre também reset e change

*Verificação de email*

- `/auth` sem feature
- Um `VerificationToken` genérico, com `purpose`
- Só a criação de usuário emite verificação — os POSTs de perfil não
- Token inválido/expirado/usado é 400 genérico
- A orquestração vive em `verification.service.ts`, não em `auth.service`

*Senha*

- Reset e change invalidam TODAS as sessões
- Change-password é single-step, sem código por email
- Senha atual errada no change é 403, não 401
- Forçar troca de senha bloqueia o login inteiro
- A checagem de `mustChangePassword` entra depois do `bannedAt` e antes do `status`
- O admin dispara o email de reset na hora

*Troca de email*

- Dois passos, e o alvo mora no token
- O endpoint de troca revela conflito (409), o `forgot-password` não
- O aviso de segurança vai para o email antigo, no pedido — não na confirmação
- `PreviousEmail` reservava o endereço para sempre — e parou de reservar (D13, 8.6)
- O `@unique` de `PreviousEmail.email` saiu junto (K25)

### [Contratos de API](context/api-contracts.md)

*Views (presenter)*

- Whitelist e não blacklist
- Por capability, não por role
- User — progressão por capability
- Demais recursos
- `GET /me`

*Erros*

- P2002 no handler, não check antecipado
- Validação sintática × semântica

*Paginação*

- Duas estratégias, um envelope só

*Tipos*

- A fronteira `FeatureName` × `string`

### [Arquitetura](context/architecture.md)

*Roteamento*

- `authenticate` saiu do `app.ts` (global) e foi para o grupo de rota

*Onde cada coisa vive*

- A gravação transacional do audit vive no repository; o service passa o descritor
- `record` é lib de observabilidade, não repository
- `src/lib/` não conhece módulo nenhum
- `src/scripts/` é código; `infra/` é agendamento
- SQL cru vive exclusivamente no repository

*Ordem de construção*

- Perfis antes de user↔role
- Primitiva de repositório antes da rota que a expõe
- Código reaproveitado entre entrypoints não pode carregar auto-execução

### [Segurança](context/security.md)

*Rate limit e lockout*

- Redis, não in-memory
- Rate limit por IP e lockout por conta são dois mecanismos, não um
- Lockout híbrido — janela fixa → backoff exponencial
- A checagem de lockout entra no ramo da senha CORRETA
- Configuração: duas env vars por regra, não uma string composta
- Conta travada responde 429 genérico
- Desbloqueio manual pelo admin, e reset completo
- Destravar alvo privilegiado exige ator admin
- Conta demo isenta do lockout (8.8)
- Rate limit dos fluxos novos vive no service, não em middleware (8.7)
- O admin divide o balde com o `forgot-password` (K27)
- As três rotas públicas de token ganharam limite juntas (K26)

*Fail-open e o que a execução ensinou*

- Fail-open quando o Redis cai é risco aceito, não esquecido
- O fail-open não sai de graça só por estar decidido (7.0)
- Isolamento de teste do Redis é por arquivo, não global

*Hardening HTTP*

- `app.set("trust proxy", 1)` (D7)
- Corpo grande demais é 413
- CORS de origem não-permitida responde sem os headers, não com erro
- Auto-hospedar o bundle do Scalar em vez de allowlistar o CDN
- A auto-hospedagem sozinha não bastou — o nonce é a segunda peça (7.1)
- Sobram violações de CSP no console de `/reference`, e elas ficam

### [Observabilidade](context/observability.md)

*As três categorias*

- Por que três e não uma
- `AsyncLocalStorage` é exceção consciente a "explicit over implicit"
- O ambiente de teste não silencia o logger — ele não monta o stdout
- O `requestId` volta ao cliente
- A rota do access log vem do contexto, não de `req.url`

*Audit log*

- Endpoint de leitura — decisão anterior revertida
- `read:audit-log:full` e não uma role como âncora
- Escopo 12/18 na primeira leva (7.6)

*Destinos*

- O ring buffer existe mesmo havendo Axiom
- Axiom e Sentry entram mesmo sem conta configurada

*Higiene e resiliência*

- Teto de sessões e faxina de tokens são higiene, não perda de auditoria
- Timeout em toda dependência externa (7.12)

### [Infraestrutura](context/infrastructure.md)

*Ambientes*

- Os dois bugs que motivaram a reformulação (Fase 6)
- Compose base + overrides
- Envs por arquivo + dotenv-cli
- Graceful shutdown nativo do Compose, não script com `spawn`
- O client Prisma do dev num volume anônimo

*Imagem e boot de produção*

- `migrate deploy`, nunca `migrate dev`
- O seed é bundlado pelo tsup (`dist/seed.js`)
- Imagem multi-stage e não-root

*Documentação da API*

- Gerada dos próprios schemas Zod, não escrita à mão
- Os presenters garantem que a doc não vaza segredo
- `/openapi.json` e `/reference` são públicas, no router de topo
- O token da coleção Bruno usa `bru.setVar`, não `setEnvVar`

*Seeds e ambiente demo*

- Role `demo` sempre semeada, usuário demo atrás de flag
- Reset do demo é truncate+reseed, e a guarda é flag explícita
- Gotcha do reseed compartilhado (7.14)
- `demo-reset` esquecia a tabela `previousEmail`

*Dataset fake*

- Duas flags independentes: `SEED_FAKE_DATA` e `SEED_ADMIN_USER`
- O dataset inclui roles com escrita (`manager`), com o risco assumido
- A idempotência depende só do email fixo
- Instância própria de Faker, não o singleton dos testes
- Criado via `userRepository`, não via `user.service`

*Achado de teste*

- `clearDatabase` não era bug

### [Schema](context/schema.md)

*O que cada fase mudou nas tabelas*

- Fase 4 — status de conta
- Fase 7
- Fase 8


---

## Como manter

- **Decisão nova** → escreva no arquivo temático (um `###` com o título da decisão) e acrescente a
  linha correspondente neste índice. O índice e os arquivos são atualizados juntos ou nenhum dos
  dois vale.
- **Decisão estrutural** (modelagem, escolha de tecnologia, algo que se re-questiona daqui a um
  ano) → vira **ADR** em [`adr/`](adr/), e aqui fica só o ponteiro. O ADR é o dono do texto.
- **Decisão revertida** → reescreva a entrada existente narrando a reversão, em vez de deixar
  decisão + errata em dois lugares. O histórico do git guarda a versão anterior.
- **Fecho de fase** → o *porquê* migra do `todo.md` para o arquivo temático **antes** de o
  passo-a-passo expandido ser removido; o que a fase entregou vai para
  [`context/history.md`](context/history.md).
- `npm run docs:check` valida que todo caminho e toda âncora citados na documentação existem.

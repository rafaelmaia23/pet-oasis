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
- O critério de granularidade, escrito na 9.1
- Pet — leitura × escrita, e não um verbo por operação
- Catálogo — quatro cortes, nenhum deles por recurso
- Custo/margem **não** entrou em `PRIVILEGED_FEATURES`

*Roles de funcionário*

- `stockist` e `catalog-manager` nasceram na 9.1
- O `demo` enxerga o domínio novo, menos o custo

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
- Pet é o primeiro filho de **domínio** do grafo (9.4) — desce como todo mundo, sobe como
  `UserRole`, e o critério é "restaurar isto concede autoridade?"
- Imagem é o único hard delete de domínio do projeto (9.10) — asset não é fato de negócio; e o
  soft delete do **produto** preserva os arquivos, senão restaurar devolveria o produto em branco

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
- A janela de graça de 10s na rotação (10.7) — o mesmo par de volta, e o 503 que recusa decidir
- A janela devolve o par **atual** da corrente, não o que o elo emitiu (10.15)
- Refresh token hasheado em repouso — item que virou teste, não código
- Teto de sessões vivas

*Status da conta*

- Status e ban são ortogonais
- Todo usuário nasce PENDING, inclusive os criados por admin
- 403 (não 401) no login quando a senha está certa mas a conta não está ACTIVE — e um `code` por condição (`ACCOUNT_BANNED`/`PASSWORD_RESET_REQUIRED`/`EMAIL_NOT_VERIFIED`, 10.8)
- Anti-enumeração em forgot / resend / signup
- O relógio do login não é oráculo: email desconhecido paga o bcrypt (10.9)

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
- `GET /me` — e o id de perfil que entrou nele na 9.4

*Superfície pública*

- A vitrine do catálogo responde sem token (9.1)
- Rate limit por IP da vitrine, balde único para as quatro leituras (9.6)

*Erros*

- P2002 no handler, não check antecipado
- Validação sintática × semântica

*Paginação*

- Duas estratégias, um envelope só
- Ordenação configurável só no offset

*Tipos*

- A fronteira `FeatureName` × `string`

### [Arquitetura](context/architecture.md)

*Roteamento*

- `authenticate` saiu do `app.ts` (global) e foi para o grupo de rota
- `optionalAuthenticate` — o terceiro modo, para a vitrine pública (9.6)

*Onde cada coisa vive*

- A gravação transacional do audit vive no repository; o service passa o descritor
- `record` é lib de observabilidade, não repository
- `src/lib/` não conhece módulo nenhum
- `src/scripts/` é código; `infra/` é agendamento
- SQL cru vive exclusivamente no repository — três pontos, e os dois locks são o
  mesmo remédio para o mesmo padrão (9.10, 9.12)

*Documentação e processo*

- Tracker (`.scratch/`, versionado: spec + uma issue por arquivo) × permanente (ADR e
  `context/`) — e por que documento permanente nunca cita o tracker, mesmo ele sendo
  versionado (9.12, retargetado na Fase 10); o mapa é [`docs/README.md`](README.md),
  as formas de fase estão em [`guides/todo-phases.md`](guides/todo-phases.md)

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

- `trust proxy` é por endereço de origem, não por contagem de saltos (D7, revisto na 10.2)
- Corpo grande demais é 413
- CORS de origem não-permitida responde sem os headers, não com erro
- A allowlist de CORS sai só da variável explícita — a `APP_URL` não entra por inércia (10.11)
- Mass assignment: schema de update é `.strict()`, e a proteção tem teste próprio (10.12)
- Todo campo de texto tem teto, e o teto é contrato (10.13)
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
- O serviço do Compose se chama `api`, com alias de rede explícito (10.1) — o nome do serviço é o
  endereço que o cliente interno escreve, e o alias explícito impede DNS que some em silêncio
- Três redes com papéis distintos, e a porta da API despublicada (10.2, revisto na 10.17) —
  `backend` interna com os dados, `pet-oasis` e `proxy` compartilhadas e ambas `external:` (rede
  entre stacks vive mais que qualquer uma delas; a `pet-oasis` gerenciada pelo compose morria no
  `prod:down` e travava o `up` do front); não publicar a porta é o que torna seguro o `trust proxy`
  por endereço
- Envs por arquivo + dotenv-cli
- Graceful shutdown nativo do Compose, não script com `spawn`
- O client Prisma do dev num volume anônimo

*Imagem e boot de produção*

- `migrate deploy`, nunca `migrate dev`
- O boot para no dado de referência e segue no de demonstração (10.3) — o seed é fatal em
  feature/role/raça/léxico e fail-open no dado atrás de flag, que só loga e some do `SeedResult`
- O seed é bundlado pelo tsup (`dist/seed.js`)
- Imagem multi-stage e não-root
- O OpenSSL vai nos três estágios da imagem, e a engine do Prisma é detectada (10.5) — sem ele a
  detecção falha e o default silencioso é a engine errada; detectar em vez de pinar é o que mantém
  o ARM64 correto
- Não existe script para apagar o banco de produção (10.5) — `down -v` de produção é ato
  deliberado, digitado à mão; script de nome amigável ao lado do `prod:up` vira erro de digitação
- A API atende num subdomínio, e o apex guarda dois 301 (10.6) — o apex é do front; `/reference` e
  `/openapi.json` continuam chegando por 301, a base das imagens segue a API sem migration (o banco
  guarda a chave), e `APP_URL` só vira depois de o front ter as quatro rotas de email
- O reverse proxy do upload existe, mas não neste repositório (9.10) — quem serve `/uploads/*` é
  o Node, e o bind mount é o que deixa a troca por nginx ser configuração
- O diretório de uploads mora fora do working tree, e o uid é fixado no serviço (10.4) — git e
  container não têm dono em comum; `UPLOAD_HOST_DIR` é obrigatória, sem fallback para dentro da árvore
- O container de dev escreve como o uid do host, não como root (10.16) — num clone novo o Docker
  cria `uploads/` como root ao montar; o entrypoint entrega a raiz ao host e cai de uid antes de gravar
- `sharp` no ARM64 exige build no próprio servidor (9.10)

*Documentação da API*

- Gerada dos próprios schemas Zod, não escrita à mão
- Os presenters garantem que a doc não vaza segredo
- `/openapi.json` e `/reference` são públicas, no router de topo
- O token da coleção Bruno usa `bru.setVar`, não `setEnvVar`

*Seeds e ambiente demo*

- Role `demo` sempre semeada, usuário demo atrás de flag
- Reset do demo é truncate+reseed, e a guarda é flag explícita
- A limpeza de upload é por prefixo de dono, nunca a raiz (9.11) — `deleteDirectory("")`
  resolveria para o ponto de montagem do bind mount
- A ordem é truncate → limpar uploads → reseed (9.11) — o filesystem não participa da transação
- O `--dry-run` conta os arquivos que apagaria (9.11), e daí o `countFiles` na interface `Storage`
- Gotcha do reseed compartilhado (7.14)
- `demo-reset` esquecia a tabela `previousEmail`

*Dataset fake*

- Duas flags independentes: `SEED_FAKE_DATA` e `SEED_ADMIN_USER`
- O dataset inclui roles com escrita (`manager`), com o risco assumido
- A idempotência depende só do email fixo
- Os bytes das imagens do seed moram em base64 num `.ts`, não em disco (9.11) — o estágio
  `runtime` do Dockerfile não copia `src/`
- O seed grava imagem pelo adaptador, nunca copiando arquivo (9.11)
- O seed não cura arquivo sumido; quem converge é o `demo-reset` (9.11)
- Instância própria de Faker — e, desde a 9.11, semeada **por chave**, para o roster ser
  conjunto e não sequência
- Criado via `userRepository`, não via `user.service`

*Achado de teste*

- `clearDatabase` não era bug

### [Domínio pet shop](context/pet-domain.md)

*O recorte* — a única decisão do Ciclo 2 sem ADR próprio; o resto é ponteiro

- Bloco A (pets) + Bloco B (catálogo), sem checkout

*Pets e raças* — [`adr/pet-domain-modeling.md`](adr/pet-domain-modeling.md)

- Espécie como enum fechado sem `OUTRO`
- Raça como tabela semeada por constante, nunca API em runtime
- `SPECIES_WITH_BREED` é constante explícita, não derivada do dado
- Dono único · falecimento é estado, não exclusão · peso é instantâneo
- O que a implementação (9.3) firmou — só cão e gato exigem raça, contrato do
  `GET /breeds`, `Breed` como dado de referência, onde a constante mora, e por
  que o seed usa `createMany` sem delete reconciliador
- O que a implementação (9.4) firmou — `microchipId` unique global, pets na
  cascata e na restauração, falecimento em rota própria, `species` editável, e o
  alvo inexistente falhando fechado em 403
- O que a implementação (9.5) firmou — `GET /pets` traz falecido por default
  (filtro `?deceased=`), filtro não resolve recurso (uuid inexistente é lista
  vazia), e só esta rota do módulo exige `:others` direto

*Catálogo* — [`adr/product-catalog-modeling.md`](adr/product-catalog-modeling.md)

- `Product` + `ProductVariant`, nunca produto plano · categoria é função, espécie
  é faceta · preço em centavos · status coexiste com soft delete
- O que a implementação (9.6) firmou na taxonomia — árvore de 3 níveis, produto
  em qualquer nó, 409 na exclusão com filha ou produto, slug derivado e
  congelado, `Tag` em hard delete, unique global e nenhuma das leituras
  paginando
- O que a implementação (9.7) firmou em produto e variante — `sku` unique
  global, estoque não-negativo, produto nasce com suas variantes numa
  transação, feature exigida por campo no `PATCH` da variante, exatamente uma
  default, 409 na última variante, vínculos por substituição total e cascata do
  produto nas variantes
- O que a implementação (9.8) firmou na leitura — `?status=` ignorado em
  silêncio, id-ou-slug numa rota só (com slug proibido de parecer UUID), preço
  do produto = menor variante ativa, `inStock` derivado em todas as views,
  espécie vazia casando com tudo, tag repetida como interseção, 404 (não 403)
  para o que o ator não pode ver, e `read:product:cost` implicando a visão
  interna

- O que o kickoff (9.9) firmou na busca textual — corpus limitado ao que a
  coluna gerada alcança (produto + marca, tag fora), erro de digitação corrigido
  **na query** por dicionário de lexemas, SQL cru só ranqueando enquanto a
  visibilidade continua no `buildProductWhere`, e o dicionário construído só do
  catálogo público

*Dataset fake do domínio (9.11)*

- O dataset é cobertura de cenário, não volume — e cada cenário é afirmado por
  teste, porque roster errado não estoura em lugar nenhum
- `costCents` em **todas** as variantes (null não prova mascaramento nenhum), e
  derivado do preço em vez de sorteado
- O pet do dono soft-deletado herda o `deletedAt` do dono, não um timestamp
  próprio — é a correlação que a restauração da Fase 8 usa
- A árvore chega ao 3º nível porque é o limite que o `category.service` defende
- Nome à mão, preço sorteado — o corpus da busca da 9.9 é o motivo; marcas reais
  com a ressalva de redistribuição registrada

*Upload* — ver os ADRs listados em
[`context/pet-domain.md`](context/pet-domain.md)

*O que o fecho da fase (9.12) corrigiu no catálogo*

- Preço e disponibilidade caem na **mesma variante** — e `?inStock=false`
  continua sendo do produto, porque é a negação da compra
- Marca não sai com produto ativo pendurado (espelho da categoria, W3)
- Id repetido em `categories`/`tags` é 422 do Zod, não 409 da chave composta
- A recusa de slug com forma de UUID vale também para o **derivado** do nome
- A última variante ativa é decidida sob lock — terceiro e último ponto de SQL
  cru do projeto

### [Schema](context/schema.md)

*O que cada fase mudou nas tabelas*

- Fase 4 — status de conta
- Fase 7
- Fase 8
- Fase 9 — os onze modelos do domínio, e o que surpreende quem lê o
  `schema.prisma`: `path` é **chave**, não caminho de arquivo; `search_vector` é
  coluna gerada invisível ao Prisma; `ProductImage` é a única tabela de domínio
  sem `deletedAt`


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

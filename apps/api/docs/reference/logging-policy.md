# Política de Logs — pet-oasis

> Status: definida na Fase 7, implementada nas sub-fases 7.3–7.6, 7.9–7.11, 7.14–7.16; fechada na 7.19.
> Escopo: o que a aplicação emite, com qual formato, para onde vai, por quanto tempo fica e quem pode ler.
> Fora de escopo: retenção e agregação a nível de infraestrutura (responsabilidade do deploy), backup e SIEM.

---

## 1. Por que três categorias

O projeto separa **três** mecanismos de log, com propósitos, destinos e ciclos de vida diferentes. A separação é deliberada: misturar tudo num único mecanismo faz cada um herdar as piores características do outro — o log de negócio afogado em ruído de tráfego, e o log de tráfego pagando o custo de escrita transacional no banco.

| | **Access log** | **Application log** | **Audit log** |
|---|---|---|---|
| Pergunta que responde | O tráfego está saudável? | O que aconteceu dentro do processo? | Quem fez o quê, em quem, quando? |
| Emissor | middleware (`pino-http`) | qualquer camada, via `pino` | camada de serviço, no ponto exato da decisão |
| Volume | 1 linha por request | variável | baixíssimo (uma por ação sensível) |
| Destino | stdout → Axiom → ring buffer | stdout → Axiom → ring buffer | tabela `AuditLog` no Postgres |
| Fonte de verdade | não (efêmero) | não (efêmero) | **sim** |
| Consultável pela aplicação | não | não | **sim** (`GET /audit-logs`) |
| Mutável | irrelevante | irrelevante | **não** — append-only |
| Retenção | `LOG_RETENTION` do provedor | idem | `AUDIT_LOG_RETENTION_DAYS` |

**Regra de decisão em uma frase:** se a pergunta futura for *"quem fez isso?"*, é audit log; se for *"por que isso quebrou?"*, é application log; se for *"quanto tráfego passou por aqui?"*, é access log.

---

## 2. Access log

Emitido pelo `pino-http`, uma linha por request.

**Campos:** método, rota, status, duração (ms), IP (`req.ip`), user-agent, `requestId`, `userId` quando autenticado.

**Níveis:** 5xx → `error`; 4xx → `warn`; demais → `info`. Rotas de ruído descem para `debug`, para não consumir cota do agregador sem informação. A lista efetiva (7.4): `/api/v1/status` (healthcheck do Compose, a cada 5s), `/reference`, `/openapi.json`, `/scalar/standalone.js`.

**Não contém:** body da requisição ou da resposta, header `Authorization`, cookies.

**Nota de implementação (7.4):** a rota logada vem do `requestContext`, não de `req.url`. O Express reescreve `req.url` ao entrar em cada router montado e a linha só é emitida no fim do request — usar `req.url` faria `/api/v1/status` aparecer como `/`, e a regra de rota-de-ruído nunca casaria.

---

## 3. Application log

Não existe um "service de application log". É o `pino` de `src/lib/logger.ts` usado com convenção: cada módulo cria seu logger com `logger.child({ module: "auth" })`, e o `requestId` entra automaticamente via `AsyncLocalStorage`.

### 3.1 Critério de nível

O nível é definido pela **ação que a linha exige**, não pela gravidade que ela aparenta:

| Nível | Significado | Exemplos |
|---|---|---|
| `fatal` | processo não consegue continuar | falha ao conectar no banco no boot |
| `error` | precisa de intervenção humana | Resend recusou o envio, exception não-tratada, falha ao gravar audit fora de transação |
| `warn` | anomalia esperada e já tratada | reuso de refresh token detectado, rate limit disparado, token de verificação expirado |
| `info` | evento relevante de negócio ou de ciclo de vida | login realizado, email disparado, SIGTERM recebido, faxina concluída |
| `debug` | detalhe de investigação | payload normalizado, decisão de cache, query lenta |
| `trace` | não usado no projeto | — |

**A regra que evita inflação de nível:** se ninguém for agir ao ver a linha, ela não é `error`. Um 404 legítimo é comportamento correto da API, não erro.

### 3.2 Nível ativo por ambiente

`LOG_LEVEL` controla o piso; o pino emite aquele nível **e todos acima**.

| Ambiente | `LOG_LEVEL` | Destinos | Efeito |
|---|---|---|---|
| development | `debug` | `pino-pretty` + ring buffer | tudo menos `trace`, formatado e colorido |
| test | `debug` | **só o ring buffer** | suíte silenciosa **e** as linhas continuam assertáveis |
| production / demo | `info` | stdout (JSON) + ring buffer | `info`, `warn`, `error`, `fatal` |

**Por que o test não é `silent` (7.3):** silenciar a raiz do pino impediria testar qualquer linha — e a política depende de teste para valer (§10, item 7). A saída limpa vem de **não montar o stream de stdout no test**, não de desligar o logger. Os testes afirmam sobre `logBuffer.list()`, sem mock, usando o mesmo mecanismo que `GET /logs/recent` expõe.

### 3.3 Onde o application log é aplicado

Cobertura mínima estabelecida na Fase 7.5, revisada a cada módulo novo:

- **auth** — login (sucesso e falha), refresh, rotação de token, **detecção de reuso de refresh token**, logout.
- **password** — reset solicitado e concluído, change concluído, uso de token expirado.
- **verificação de email** — envio disparado (com `trigger`: `ACCOUNT_CREATION` na criação da conta, `RESEND` no reenvio pedido pelo usuário), falha de envio (em `email`, `error`), token inválido.
- **user** — criação, soft delete, ban e unban.
- **permission** — grant e revoke de role e de override.
- **ciclo de vida** — boot, SIGTERM, fechamento de conexões, execução de scripts de manutenção.

`console.log` e `console.error` não são usados em nenhum lugar da aplicação, com **uma exceção**: `src/config/env.ts` reporta env inválida com `console.error` antes de `process.exit(1)`. Ali o logger ainda não existe — ele depende do `LOG_LEVEL` que acabou de falhar na validação. Qualquer outra ocorrência é bug.

---

## 4. Audit log

Trilha durável de ações sensíveis, em `AuditLog`. Cada linha é evidência: registra **ator**, **ação**, **alvo** e **quando**.

### 4.1 Invariantes

1. **Append-only.** A aplicação não faz `UPDATE` nem `DELETE` em `AuditLog`. A única exceção é o script de retenção (§7), que remove linhas por idade.
2. **Sem endpoint de escrita.** Nenhuma rota grava audit diretamente; a gravação nasce sempre de uma ação de negócio.
3. **Taxonomia fechada.** Toda ação vem da tabela em §4.3. Ação nova exige entrada nesta política antes do código.
4. **`metadata` sem PII.** Apenas ids e enums. Nunca email, nome, telefone ou endereço. **Conjunto** de enums também vale (`string[]`, aberto na 8.4): a reativação de conta precisa dizer *quais* perfis voltaram, não quantos, e um `ProfileKind[]` continua sendo enum. O que a regra proíbe é dado pessoal, não cardinalidade.
5. **Consistência transacional.** Ação que muda estado grava o audit na **mesma `$transaction`**: se o audit falha, a ação é desfeita. Uma trilha com buracos é pior que trilha nenhuma, porque induz a conclusões erradas. **Como (7.6):** a transação vive no **repository** (regra "só o repo toca o Prisma"); o **service** decide a semântica e passa um `AuditDescriptor` ao método de escrita, que roda a mutação e `record(descriptor, tx)` na mesma `$transaction` interativa. Com `tx`, `record` deixa o erro **propagar** — a transação inteira reverte.
6. **Eventos sem transação** (login falho, e futuramente rate limit e lockout) gravam direto: `record` sem `tx` escreve fora de transação, **engole** a falha e emite `error` no application log — não derruba o request.
7. **`record` é lib de observabilidade**, a mesma classe de exceção do `logger`/`AsyncLocalStorage` (§6): pode ser chamada de qualquer camada, mas nenhuma regra de negócio lê dela.

### 4.2 Por que `metadata` não carrega PII

Três razões que se reforçam:

- **Habilita o acesso do demo.** Sem PII no payload, a role `demo` pode ler a trilha sem que um recrutador veja o email de outro.
- **Evita mentira histórica.** Ids são estáveis; emails mudam. Uma trilha que guardou o email antigo passa a afirmar algo falso sobre o presente.
- **Reduz superfície.** Quem precisa do email resolve `targetId` via `GET /users/:id`, sujeito ao RBAC daquele endpoint. O controle de acesso ao dado pessoal fica num lugar só.

### 4.3 Taxonomia de ações

Convenção: `SCREAMING_SNAKE`, no formato `RECURSO_ACAO_NO_PASSADO` — o audit registra o que **já aconteceu**.

| Ação | `targetType` | `metadata` (só ids/enums) | Sub-fase |
|---|---|---|---|
| `AUTH_LOGIN_FAILED` | `User` | `reason` (enum: `BAD_CREDENTIALS`, `BANNED`, `LOCKED`) | 7.6 |
| `AUTH_LOCKOUT_TRIGGERED` | `User` | `failureCount`, `backoffLevel`, `unlockAt` | 7.10 |
| `AUTH_LOCKOUT_CLEARED` | `User` | `clearedBy` (enum: `ADMIN`, `SUCCESSFUL_LOGIN`) | 7.10 |
| `AUTH_RATE_LIMIT_EXCEEDED` | `Route` | `rule`, `scope` (enum: `IP`, `EMAIL`) | 7.9 |
| `AUTH_REFRESH_GRACE_SERVED` | `User` | `sessionId` (o elo reapresentado), `chainHops` (saltos até o par atual; `0` é o caso ordinário) | 10.7 · 10.15 |
| `USER_CREATED` | `User` | `source` (enum: `SIGNUP`, `ADMIN`, `SEED`) | 7.6 |
| `USER_DELETED` | `User` | `cascadedProfiles`, `cascadedRoles`, `cascadedOverrides`, `cascadedPets` (nº de filhos derrubados junto) | 7.6 · 8.1 · 9.4 |
| `USER_PROFILE_CREATED` | `User` | `profileKind`, `roles` (nº de roles concedidas) | 8.3 |
| `USER_PROFILE_RESTORED` | `User` | `profileKind`, `restoredRoles` (voltaram por correlação de data), `grantedRoles` (nomeadas pelo ator), `restoredPets` | 8.3 · 9.4 |
| `USER_PROFILE_DELETED` | `User` | `profileKind` (enum: `CUSTOMER`, `EMPLOYEE`), `cascadedRoles`, `cascadedOverrides`, `cascadedPets` (sempre 0 no perfil de funcionário) | 8.1 · 9.4 |
| `USER_BANNED` | `User` | `reasonProvided` (bool — o texto **não** entra) | 7.6 |
| `USER_UNBANNED` | `User` | — | 7.6 |
| `USER_ROLE_GRANTED` | `User` | `roleId`, `roleName` | 7.6 |
| `USER_ROLE_REVOKED` | `User` | `roleId`, `roleName`, `cascadedOverrides` (nº de overrides derrubados junto) | 7.6 · 8.0 |
| `USER_PERMISSION_GRANTED` | `User` | `featureName`, `roleId`, `roleName`, `effect` | 7.6 · 8.0 |
| `USER_PERMISSION_REVOKED` | `User` | `featureName`, `roleId` | 7.6 · 8.0 |
| `ACCOUNT_REACTIVATION_REQUESTED` | `User` | `source` (enum: `SELF`, `ADMIN`), `profiles` (`ProfileKind[]`), `roles` (nº de roles nomeadas) | 8.4 · 8.5 |
| `ACCOUNT_REACTIVATION_COMPLETED` | `User` | `profilesRestored`, `profilesCreated` (`ProfileKind[]`), `restoredRoles`, `grantedRoles` (nº — restaurada por correlação de data ≠ concedida pelo ator, só a segunda é autoridade nova), `restoredPets` | 8.4 · 9.4 |
| `PASSWORD_RESET_REQUESTED` | `User` | — | 7.6 |
| `PASSWORD_RESET_COMPLETED` | `User` | — | 7.6 |
| `PASSWORD_CHANGED` | `User` | — | 7.6 |
| `PASSWORD_CHANGE_FORCED` | `User` | — | 7.16 |
| `EMAIL_CHANGE_REQUESTED` | `User` | — | 7.15 |
| `EMAIL_CHANGE_COMPLETED` | `User` | — | 7.15 |
| `DEMO_RESET_EXECUTED` | `System` | `tablesTruncated`, `rowsDeleted`, `durationMs` | 7.14 |
| `PET_CREATED` | `Pet` | `customerId`, `species`, `source` (enum: `SELF`, `STAFF`) | 9.4 |
| `PET_UPDATED` | `Pet` | `customerId`, `fieldsChanged` (`string[]`) | 9.4 |
| `PET_DELETED` | `Pet` | `customerId` | 9.4 |
| `PET_DECEASED` | `Pet` | `customerId` | 9.4 |
| `BRAND_CREATED` | `Brand` | — | 9.6 |
| `BRAND_UPDATED` | `Brand` | `fields` (`string[]` — nomes dos campos enviados) | 9.6 |
| `BRAND_DELETED` | `Brand` | — | 9.6 |
| `CATEGORY_CREATED` | `Category` | `parentId` (só quando não é raiz) | 9.6 |
| `CATEGORY_UPDATED` | `Category` | `fields` (`string[]`) | 9.6 |
| `CATEGORY_DELETED` | `Category` | — | 9.6 |
| `TAG_CREATED` | `Tag` | — | 9.6 |
| `TAG_UPDATED` | `Tag` | `fields` (`string[]`) | 9.6 |
| `TAG_DELETED` | `Tag` | — | 9.6 |
| `PRODUCT_CREATED` | `Product` | — | 9.7 |
| `PRODUCT_UPDATED` | `Product` | `fields` (`string[]` — nomes dos campos enviados) | 9.7 |
| `PRODUCT_DELETED` | `Product` | `cascadedVariants` (nº de variantes soft-deletadas junto) | 9.7 |
| `PRODUCT_VARIANT_CREATED` | `ProductVariant` | `productId` | 9.7 |
| `PRODUCT_VARIANT_UPDATED` | `ProductVariant` | `productId`, `fields` (`string[]`, só os de catálogo) | 9.7 |
| `PRODUCT_VARIANT_DELETED` | `ProductVariant` | `productId`, `promotedVariantId` (só quando a excluída era a default) | 9.7 |
| `PRODUCT_STOCK_ADJUSTED` | `ProductVariant` | `productId`, `from`, `to` | 9.7 |
| `PRODUCT_IMAGE_UPLOADED` | `Product` | `imageId` | 9.10 |
| `PRODUCT_IMAGE_DELETED` | `Product` | `imageId` | 9.10 |
| `PRODUCT_IMAGES_REORDERED` | `Product` | `count` (reordenação pedida) ou `reason: "COMPACTION"` (posições fechadas após exclusão) | 9.10 |
| `PET_PHOTO_UPDATED` | `Pet` | `customerId` | 9.10 |
| `PET_PHOTO_DELETED` | `Pet` | `customerId` | 9.10 |
| `BRAND_LOGO_UPDATED` | `Brand` | — | 9.10 |
| `BRAND_LOGO_DELETED` | `Brand` | — | 9.10 |

Nome do pet **não** entra em `metadata` de nenhuma das quatro ações acima — não
por ser PII do pet, mas porque nome de pet é frequentemente usado como resposta
de pergunta de segurança e como componente de senha; e porque a política
vigente é "ids e enums", que só vale se não for flexibilizada caso a caso
(planejamento da Fase 9, `docs/adr/0006-pet-domain-modeling.md`). Provado por teste: o
`metadata` de `PET_CREATED` não contém o nome enviado no cadastro.

As nove ações de taxonomia (9.6) seguem a mesma regra do pet: **o nome não entra
na `metadata`**. Aqui não é questão de PII — nome de marca é público — mas de não
flexibilizar "só ids e enums" caso a caso; quem quiser o nome resolve o
`targetId` pela própria rota do recurso. A exceção deliberada é `TAG_DELETED`:
como a exclusão de tag é **hard** (9.6/W5), essa linha do audit é o único
registro de que a tag existiu, e mesmo assim ela guarda só o id — recuperar o
nome exige o `TAG_CREATED` correspondente, que tem o mesmo `targetId`.

`PET_DECEASED` só é gravada na transição — remarcar um pet já falecido é no-op e
não gera linha nova. **Desfazer** a marcação (`DELETE /pets/:petId/deceased`) sai
como `PET_UPDATED` com `fieldsChanged: ["deceasedAt"]`, e não como uma ação
própria: corrigir um dado errado é update, não um evento de negócio.

**Ajuste de estoque tem ação própria** (`PRODUCT_STOCK_ADJUSTED`, 9.7): é outro
ato que um `PRODUCT_VARIANT_UPDATED` genérico esconderia — outra feature
(`manage:stock`), outro cargo (o repositor, que não edita catálogo) e outra
pergunta na auditoria. Um `PATCH` que mistura estoque e catálogo grava **as
duas** linhas, porque as duas perguntas seguem válidas. `from`/`to` são
quantidades, não PII, e é o par que torna a linha útil sem consultar o estado
anterior.

Nome comercial e descrição do produto **não** entram na `metadata`, pela mesma
regra "só ids e enums" da taxonomia — provado por teste no `PRODUCT_CREATED`.

**As sete ações de imagem (9.10) têm o `targetType` do DONO** (`Product`, `Pet`,
`Brand`), com o `imageId` na `metadata` — e não um `targetType` `ProductImage`
novo. Alvo novo no enum só se paga quando alguém vai **filtrar** por ele em
`GET /audit-logs?targetType=`, e a pergunta real de auditoria é "o que aconteceu
com este produto?", nunca "com esta imagem?". Reusar o dono mantém o histórico
de imagem na linha do tempo do produto, que é onde se procura.

Nome de arquivo enviado pelo cliente **não** entra na `metadata` — nem poderia:
o pipeline o descarta antes de qualquer escrita (o arquivo é nomeado por uuid
gerado por nós), então não existe ponto do código em que ele esteja disponível
para ser logado.

`PRODUCT_IMAGE_DELETED` é, como `TAG_DELETED`, registro de um **hard delete**
(`docs/adr/0046-imagem-unico-hard-delete-dominio-projeto.md`): a linha some junto com os arquivos, e esta é a
única prova de que a imagem existiu. A compactação de posições que a exclusão
dispara sai como `PRODUCT_IMAGES_REORDERED` com `reason: "COMPACTION"`, separada
da reordenação pedida por um humano — as duas mexem no mesmo dado, mas só uma é
uma decisão de alguém.

`actorId` é nulo quando não há ator identificado (login falho de email inexistente, script automatizado). `AUTH_LOGIN_FAILED` de conta existente registra o `targetId` do dono, mesmo sem ator.

---

## 5. Dados proibidos e redigidos

### 5.1 Nunca saem da aplicação, em nenhuma categoria

Aplicado via `redact` do pino (§ `src/lib/logger.ts`) e replicado no `beforeSend` do Sentry:

- senha em qualquer forma — `password`, `currentPassword`, `newPassword`, `passwordHash`
- tokens — `accessToken`, `refreshToken`, `token`, token de verificação, token de reset
- header `Authorization`
- header `Cookie` / `Set-Cookie`
- body das rotas de autenticação (login, signup, reset, change)

A lista é única e compartilhada: qualquer destino novo (Axiom, Sentry, ring buffer) consome a mesma configuração. Um destino que escapasse do `redact` anularia a política inteira.

**Gotcha ao acrescentar campo à lista:** no pino os caminhos de `redact` são **literais**, não padrões — declarar `password` censura só a chave de topo. Cada campo entra também na forma `*.password`, senão o mesmo dado aninhado num objeto (`{ body: { password } }`) passa direto. Ao incluir um campo novo, incluir as duas formas.

### 5.2 Permitidos

- **IP** — registrado por inteiro no access log, no application log e no `AuditLog`. É evidência necessária para investigar abuso e para o rate limit fazer sentido.
- **Email** — permitido no access/application log (útil para depurar fluxo de envio). **Proibido** no `metadata` do audit (§4.2).
- **`userId`, `roleId`, `featureName`** — permitidos em todas as categorias.

### 5.3 Mascarado na leitura

`GET /audit-logs` devolve `ip` mascarado (`192.168.1.***`) para quem não tem a feature **`read:audit-log:full`**. O dado permanece íntegro no banco; o mascaramento é da camada de serialização.

---

## 6. Correlação

Todo request recebe um `requestId` no middleware de topo (`x-request-id` do cliente se vier, senão `crypto.randomUUID()`), guardado em `AsyncLocalStorage`. O `mixin` do logger raiz injeta esse id em **toda** linha, e o `auditLog.record()` lê `actorId`/`ip`/`userAgent` do mesmo store.

Efeito prático: com um `requestId` você recupera a linha de access log, todas as linhas de application log e as linhas de audit daquele request, nos três destinos.

**O id é devolvido ao cliente (7.5):** no header `x-request-id` de toda resposta e no campo `requestId` do corpo de **toda resposta de erro**. É o que transforma "deu erro ontem à tarde" num request localizável: o usuário cita o id. O `requestId` **não** é segredo — não revela nada sobre o sistema — e o corpo de erro nunca carrega stack.

**Decisão registrada:** `AsyncLocalStorage` é uma exceção consciente ao princípio "explicit over implicit" do projeto. A alternativa — passar um `context` em toda assinatura de service — seria explícita, mas poluiria dezenas de assinaturas para entregar um valor usado só no fundo da pilha. A exceção fica limitada ao contexto de observabilidade; nenhuma regra de negócio lê do store.

---

## 7. Retenção

| Categoria | Controle | Demo | Produção |
|---|---|---|---|
| Access + application log | plano do Axiom | 30 dias | 30 dias |
| Ring buffer | `LOG_BUFFER_SIZE` (default 500 entradas) | volátil | volátil |
| Audit log | `AUDIT_LOG_RETENTION_DAYS` | 21 dias | 365 dias |
| Sessões e tokens mortos | `SESSION_RETENTION_DAYS` | 30 dias | 30 dias |

O ring buffer (`src/lib/logBuffer.ts`) se defende sozinho, porque é memória do processo: entrada acima de `MAX_ENTRY_SIZE` é **truncada** (uma linha gigante não pode comer a memória das outras) e linha malformada é **descartada em silêncio**. É a mesma regra que já governa o `record` sem transação (§4.1, item 6): o subsistema de log nunca derruba quem loga.

O descarte do `AuditLog` acontece **exclusivamente** em `src/scripts/cleanup-audit-log.ts`, rodado por agendador externo, nunca dentro do ciclo request/response. É o único ponto do código autorizado a deletar audit log.

---

## 8. Acesso à leitura

| Recurso | Feature | Quem tem | Observação |
|---|---|---|---|
| `GET /logs/recent` | `read:log` | admin, manager, **demo** | ring buffer, por processo, volátil |
| `GET /audit-logs` | `read:audit-log` | admin, manager, **demo** | cursor pagination; `ip` mascarado |
| `GET /audit-logs` com `ip` inteiro | `read:audit-log:full` | admin, manager | modificador do padrão `ação:recurso:modificador`; o demo **não** tem |
| Axiom | conta do provedor | mantenedor | fora do RBAC da aplicação |
| Sentry | conta do provedor | mantenedor | fora do RBAC da aplicação |

O acesso do usuário demo é intencional: é o que torna a trilha de auditoria visível para quem avalia o projeto sem ter acesso às contas do mantenedor. É seguro porque §4.2 garante que não há PII no payload e §5.3 mascara o IP.

**Concessão de `read:audit-log:full` é privilegiada (Fase 7.8):** como destrava o IP inteiro, `read:audit-log:full` entra em `PRIVILEGED_FEATURES` (`@pet-oasis/api-contracts/feature`) — concedê-la via override, ou atribuir uma role que a contenha, exige role **admin**, no mesmo idioma de não-escalação das features de permissão. `read:log`/`read:audit-log` são normais (concedíveis por um manager sem ser admin).

Não existe rota de escrita, edição ou remoção de log. Ausência de `PATCH`/`DELETE` em `/audit-logs` é coberta por teste.

---

## 9. Limitações conhecidas

Documentadas em vez de escondidas:

- **Ring buffer é por processo.** Com mais de uma réplica, `GET /logs/recent` mostra apenas a fatia da instância que atendeu o request. A resposta declara isso em `meta`.
- **Ring buffer é volátil.** Reinício do processo zera o conteúdo.
- **Falha do destino externo degrada, não derruba.** Axiom indisponível → a aplicação continua escrevendo em stdout e no buffer. Sentry indisponível → o erro continua sendo logado normalmente. Nenhum request falha por causa do subsistema de log.
- **Sem LGPD nesta fase.** O projeto é portfólio e não trata dado real de titular. O delete de usuário é soft delete e **preserva** `actorId`/`targetId` no audit. Anonimização, base legal e resposta a requisição de titular estão no `docs/reference/backlog.md`.

---

## 10. Checklist para eventos novos

Ao adicionar um evento ao sistema:

1. É "quem fez o quê"? → audit log. Senão → application log (ou nada).
2. Se audit: a ação já está na tabela §4.3? Se não, adicionar aqui **antes** do código.
3. O `metadata` tem só ids e enums?
4. A ação muda estado? Se sim, o `record` está dentro da mesma `$transaction`?
5. Se application log: o nível segue o critério de §3.1 ("alguém vai agir ao ver isso?").
6. Algum campo da linha está em §5.1? Se sim, confirmar que o `redact` cobre o caminho exato.
7. Existe teste garantindo que a linha é emitida e que não vaza campo proibido?

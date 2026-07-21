# Política de Logs — pet-oasis

> Status: definida na Fase 7, implementada nas sub-fases 7.3–7.9.
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
- **verificação de email** — envio disparado, falha de envio, reenvio.
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
4. **`metadata` sem PII.** Apenas ids e enums. Nunca email, nome, telefone ou endereço.
5. **Consistência transacional.** Ação que muda estado grava o audit na **mesma `$transaction`**: se o audit falha, a ação é desfeita. Uma trilha com buracos é pior que trilha nenhuma, porque induz a conclusões erradas.
6. **Eventos sem transação** (login falho, rate limit excedido, lockout) gravam direto. Falha aqui **não** derruba o request, mas emite `error` no application log.

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
| `AUTH_LOCKOUT_TRIGGERED` | `User` | `failureCount`, `backoffLevel`, `unlockAt` | 7.11 |
| `AUTH_LOCKOUT_CLEARED` | `User` | `clearedBy` (enum: `ADMIN`, `SUCCESSFUL_LOGIN`) | 7.11 |
| `AUTH_RATE_LIMIT_EXCEEDED` | `Route` | `rule`, `scope` (enum: `IP`, `EMAIL`) | 7.10 |
| `USER_CREATED` | `User` | `source` (enum: `SIGNUP`, `ADMIN`, `SEED`) | 7.6 |
| `USER_DELETED` | `User` | — | 7.6 |
| `USER_BANNED` | `User` | `reasonProvided` (bool — o texto **não** entra) | 7.6 |
| `USER_UNBANNED` | `User` | — | 7.6 |
| `USER_ROLE_GRANTED` | `User` | `roleId`, `roleName` | 7.6 |
| `USER_ROLE_REVOKED` | `User` | `roleId`, `roleName` | 7.6 |
| `USER_PERMISSION_GRANTED` | `User` | `featureName`, `effect` | 7.6 |
| `USER_PERMISSION_REVOKED` | `User` | `featureName` | 7.6 |
| `PASSWORD_RESET_REQUESTED` | `User` | — | 7.6 |
| `PASSWORD_RESET_COMPLETED` | `User` | — | 7.6 |
| `PASSWORD_CHANGED` | `User` | — | 7.6 |
| `PASSWORD_CHANGE_FORCED` | `User` | — | 7.16 |
| `EMAIL_CHANGE_REQUESTED` | `User` | — | 7.15 |
| `EMAIL_CHANGE_COMPLETED` | `User` | — | 7.15 |
| `DEMO_RESET_EXECUTED` | `System` | `tablesTruncated`, `rowsDeleted`, `durationMs` | 7.18 |

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

Não existe rota de escrita, edição ou remoção de log. Ausência de `PATCH`/`DELETE` em `/audit-logs` é coberta por teste.

---

## 9. Limitações conhecidas

Documentadas em vez de escondidas:

- **Ring buffer é por processo.** Com mais de uma réplica, `GET /logs/recent` mostra apenas a fatia da instância que atendeu o request. A resposta declara isso em `meta`.
- **Ring buffer é volátil.** Reinício do processo zera o conteúdo.
- **Falha do destino externo degrada, não derruba.** Axiom indisponível → a aplicação continua escrevendo em stdout e no buffer. Sentry indisponível → o erro continua sendo logado normalmente. Nenhum request falha por causa do subsistema de log.
- **Sem LGPD nesta fase.** O projeto é portfólio e não trata dado real de titular. O delete de usuário é soft delete e **preserva** `actorId`/`targetId` no audit. Anonimização, base legal e resposta a requisição de titular estão no `docs/backlog.md`.

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

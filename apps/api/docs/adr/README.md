# ADRs da API — índice

> **Não leia este índice inteiro, e não leia todos os ADRs.** Ele é um roteador: ache a
> decisão de que você precisa, abra **só** o ADR dela. Uma sessão de trabalho típica lê este
> índice e um ou dois ADRs.
>
> Cada arquivo é **uma decisão**, no formato da skill `domain-modeling`: título, contexto e
> porquê. Os dez primeiros (`0001`–`0010`) são as decisões estruturais, escritas como ADR desde
> a origem; do `0011` em diante estão as decisões que viviam nos arquivos temáticos de
> `docs/context/` (migradas em 2026-09-18, texto original, links reapontados). A numeração é
> sequencial: ADR novo ganha o próximo número, e entra aqui na seção do tema dele.
>
> O vocabulário (o que cada termo significa) é o [`CONTEXT.md`](../../CONTEXT.md) da API; o
> essencial acionável está no `CLAUDE.md`; o estado das tarefas, no `docs/todo.md` da raiz.

---

## Decisões estruturais

| ADR | Assunto |
|---|---|
| [`0001`](0001-auth-token-revocation.md) | Revogação de token e armazenamento (auth) — dívida consciente do JWT stateless |
| [`0002`](0002-environments-and-deploy.md) | Ambientes (dev/test/prod), Docker por ambiente e deploy |
| [`0003`](0003-rate-limiting-and-lockout.md) | Rate limiting, account lockout e a dependência do Redis |
| [`0004`](0004-pagination.md) | Paginação: duas estratégias, um envelope |
| [`0005`](0005-authorization-scope-and-lifecycle.md) | Escopo do override e ciclo de vida de deleção/restauração |
| [`0006`](0006-pet-domain-modeling.md) | Modelagem do domínio de pets |
| [`0007`](0007-product-catalog-modeling.md) | Modelagem do catálogo: produto, variante, categoria e espécie |
| [`0008`](0008-product-vs-service.md) | Produto vs. serviço: por que ficam em tabelas separadas |
| [`0009`](0009-text-search.md) | Busca textual do catálogo: Postgres nativo, não `ILIKE` nem motor externo |
| [`0010`](0010-file-storage-and-uploads.md) | Upload de imagem: disco local atrás de um adaptador |

Documentos irmãos, que são fonte única do que cobrem (não duplicar aqui):
[`reference/schema.md`](../reference/schema.md) (por que uma coluna é assim, o que cada fase
mudou nas tabelas, invariantes), [`reference/logging-policy.md`](../reference/logging-policy.md)
(categorias de log, taxonomia de audit, dados proibidos, retenção),
[`reference/endpoints.md`](../reference/endpoints.md) (índice de rotas),
[`reference/history.md`](../reference/history.md) (o que cada fase entregou — leitura rara)
e o [backlog](../../../../docs/reference/backlog.md) da raiz (o que ficou de fora e por quê).

---

## Índice por tema

Uma linha por decisão. O título é a decisão; o ADR tem o argumento completo, os
contra-argumentos e os gotchas.

### Autorização

> O *porquê* do modelo de permissões. O modelo em si (invariantes, alternativas recusadas)
> está no ADR [`0005-authorization-scope-and-lifecycle.md`](0005-authorization-scope-and-lifecycle.md);
> as regras já firmadas, no `CLAUDE.md`.

#### Ordem e forma da checagem

- [`0011`](0011-autorizacao-sempre-antes-busca.md) Autorização sempre antes da busca
- [`0012`](0012-autorizacao-duas-etapas-quando-ramo-depende-banco.md) Autorização em duas etapas quando o ramo depende do banco
- [`0013`](0013-computo-dois-lacos-nao-aninhado.md) Cômputo em dois laços, não um aninhado

#### Não-escalação

- [`0014`](0014-ancora-role-admin-nao-feature.md) A âncora é a role admin, não a feature
- [`0015`](0015-guard-vale-roles-nao-so-overrides.md) O guard vale para roles, não só para overrides
- [`0016`](0016-furo-fechado-8-3-nascer-role-ser-atribuido-ela.md) Furo fechado na 8.3 — nascer com a role é ser atribuído a ela
- [`0017`](0017-tres-guards-alvo-mesmo-conceito.md) Nos três guards, o alvo é o mesmo conceito

#### Escopo do override

- [`0018`](0018-override-pendura-atribuicao-role-nao-usuario.md) O override pendura na atribuição de role, não no usuário (D2)
- [`0019`](0019-linha-userid-roleid-sempre.md) Uma linha por `(userId, roleId)` para sempre (D3)
- [`0020`](0020-role-vai-path.md) A role vai no path (D9)
- [`0021`](0021-422-put-sem-role-ativa-404-delete.md) 422 no `PUT` sem a role ativa, mas 404 no `DELETE`
- [`0022`](0022-delete-override-sem-override-ativo-404-nao-204.md) `DELETE` de override sem override ativo → 404, não 204
- [`0023`](0023-consequencia-do-escopo-na-view.md) Consequência na view

#### Vínculo user↔role

- [`0024`](0024-perfis-vem-antes-user-role.md) Perfis vêm antes de user↔role
- [`0025`](0025-post-orienta-nao-cria-perfil.md) `POST` orienta, não cria perfil
- [`0026`](0026-delete-protege-ultimo-vinculo-perfil.md) `DELETE` protege o último vínculo do perfil
- [`0027`](0027-roles-default-criacao.md) Roles default na criação

#### Catálogo de features

- [`0028`](0028-nome-diz-recurso-create-customer-profile-nao-create.md) O nome diz o recurso (`create:customer-profile`, não `create:profile`)
- [`0029`](0029-reactivate-feature-separada-create.md) `reactivate:*` é feature separada de `create:*` (K12)
- [`0030`](0030-create-reactivate-customer-profile-moram-self-management.md) `create:`/`reactivate:customer-profile` moram em `SELF_MANAGEMENT_FEATURES`
- [`0031`](0031-read-audit-log-full-entrou-privileged-features.md) `read:audit-log:full` entrou em `PRIVILEGED_FEATURES`
- [`0032`](0032-criterio-granularidade-escrito-9-1.md) O critério de granularidade, escrito na 9.1
- [`0033`](0033-pet-leitura-escrita-nao-verbo-operacao.md) Pet — leitura × escrita, e não um verbo por operação
- [`0034`](0034-catalogo-quatro-cortes-nenhum-deles-recurso.md) Catálogo — quatro cortes, nenhum deles por recurso
- [`0035`](0035-custo-margem-nao-entrou-privileged-features.md) Custo/margem **não** entrou em `PRIVILEGED_FEATURES`

#### Roles de funcionário

- [`0036`](0036-stockist-catalog-manager-nasceram-9-1.md) `stockist` e `catalog-manager` nasceram na 9.1
- [`0037`](0037-demo-enxerga-dominio-novo-menos-custo.md) O `demo` enxerga o domínio novo, menos o custo


### Ciclo de vida

> A cascata de deleção desce quatro níveis; a restauração sobe dois. O modelo completo, com
> invariantes e alternativas recusadas, está no ADR
> [`0005-authorization-scope-and-lifecycle.md`](0005-authorization-scope-and-lifecycle.md).

#### Soft delete

- [`0038`](0038-userfeature-userrole-tambem-tem-soft-delete.md) Por que `UserFeature`/`UserRole` também têm soft delete
- [`0039`](0039-cascata-escrita-mao-nao-pelo-banco.md) A cascata é escrita à mão, não pelo banco
- [`0040`](0040-unico-new-date-transacao.md) Um único `new Date()` por transação (D4)

#### Restauração

- [`0041`](0041-correlacao-data-nao-coluna-motivo.md) Correlação por data, não por coluna de "motivo" (D5)
- [`0042`](0042-restauracao-para-na-role.md) A restauração para na role (D6')
- [`0043`](0043-nivel-user-perfil-deixou-correlacionar.md) O nível `User` → perfil deixou de correlacionar (K20)
- [`0044`](0044-tres-niveis-nasceram-como-primitivas-repositorio.md) Os três níveis nasceram como primitivas de repositório (K7)
- [`0045`](0045-grantrolestouser-nasceu-como-primitiva.md) `grantRolesToUser` nasceu como primitiva
- [`0046`](0046-imagem-unico-hard-delete-dominio-projeto.md) Imagem é hard delete, como a tag (9.10)
- [`0047`](0047-pet-primeiro-filho-dominio-grafo.md) Pet é o primeiro filho de **domínio** do grafo (9.4)

#### Perfil — os fluxos de produto

- [`0048`](0048-mesma-rota-cria-reativa.md) A mesma rota cria e reativa (8.3)
- [`0049`](0049-rolenames-roles-perfil-volta-nao-filtro.md) `roleNames` é "com que roles o perfil volta", não filtro

#### Conta — deleção e reativação

- [`0050`](0050-reativacao-exige-senha-nova.md) A reativação exige senha nova (K17)
- [`0051`](0051-signup-dispara-reativacao-responde-202.md) O signup que dispara reativação responde 202 (K18)
- [`0052`](0052-admin-nao-reativa-nada-sozinho.md) O admin não reativa nada sozinho
- [`0053`](0053-phone-pedido-confirmacao-nao-pedido.md) O `phone` é pedido na confirmação, não no pedido (K23)
- [`0054`](0054-guard-corre-sobre-roles-vao-voltar.md) O guard corre sobre as roles que vão voltar (K22)


### Identidade e sessões

> Tudo que diz respeito a *quem é o usuário e se ele pode entrar*: o desenho de sessão
> (access JWT + refresh rotativo), o status da conta, verificação e troca de email, senha e
> banimento. Revogação de token tem ADR próprio:
> [`0001-auth-token-revocation.md`](0001-auth-token-revocation.md).

#### Sessão e refresh

- [`0055`](0055-design-session-access-jwt-15min-refresh-opaco-rotativo.md) Design de `Session` — access JWT 15min + refresh opaco rotativo
- [`0056`](0056-ordem-checagem-refresh-reuso-invalidada-expirada.md) Ordem de checagem no `refresh`: reuso → invalidada → expirada
- [`0057`](0057-janela-graca-10s-rotacao.md) A janela de graça de 10s na rotação (10.7)
- [`0058`](0058-refresh-token-hasheado-repouso-item-virou-teste-nao.md) Refresh token hasheado em repouso — item que virou teste, não código
- [`0059`](0059-teto-de-sessoes-vivas.md) Teto de sessões vivas

#### Status da conta

- [`0060`](0060-status-ban-sao-ortogonais.md) Status e ban são ortogonais
- [`0061`](0061-todo-usuario-nasce-pending-inclusive-criados-admin.md) Todo usuário nasce PENDING, inclusive os criados por admin
- [`0062`](0062-403-nao-401-login-quando-senha-esta-certa-conta-nao-esta.md) 403 (não 401) no login quando a senha está certa mas a conta não está ACTIVE
- [`0063`](0063-anti-enumeracao-forgot-resend-signup.md) Anti-enumeração em forgot / resend / signup
- [`0064`](0064-relogio-login-nao-oraculo-email-desconhecido-paga-bcrypt.md) O relógio do login não é oráculo: email desconhecido paga o bcrypt (10.9)

#### Ban — a conta congelada

- [`0065`](0065-ban-reusa-ancora-admin-nao-escalacao.md) Ban reusa a âncora admin da não-escalação
- [`0066`](0066-guard-ban-difere-role-auto-ban-409.md) O guard do ban difere do de role, e auto-ban é 409
- [`0067`](0067-conta-congelada-cobre-tambem-reset-change.md) "Conta congelada" cobre também reset e change

#### Verificação de email

- [`0068`](0068-auth-sem-feature.md) `/auth` sem feature
- [`0069`](0069-verificationtoken-generico-purpose.md) Um `VerificationToken` genérico, com `purpose`
- [`0070`](0070-so-criacao-usuario-emite-verificacao-posts-perfil-nao.md) Só a criação de usuário emite verificação — os POSTs de perfil não
- [`0071`](0071-token-invalido-expirado-usado-400-generico.md) Token inválido/expirado/usado é 400 genérico
- [`0072`](0072-orquestracao-vive-verification-service-ts-nao-auth.md) A orquestração vive em `verification.service.ts`, não em `auth.service`

#### Senha

- [`0073`](0073-reset-change-invalidam-todas-sessoes.md) Reset e change invalidam TODAS as sessões
- [`0074`](0074-change-password-single-step-sem-codigo-email.md) Change-password é single-step, sem código por email
- [`0075`](0075-senha-atual-errada-change-403-nao-401.md) Senha atual errada no change é 403, não 401
- [`0076`](0076-forcar-troca-senha-bloqueia-login-inteiro.md) Forçar troca de senha bloqueia o login inteiro
- [`0077`](0077-checagem-mustchangepassword-entra-depois-bannedat-antes.md) A checagem de `mustChangePassword` entra depois do `bannedAt` e antes do `status`
- [`0078`](0078-admin-dispara-email-reset-hora.md) O admin dispara o email de reset na hora

#### Troca de email

- [`0079`](0079-dois-passos-alvo-mora-token.md) Dois passos, e o alvo mora no token
- [`0080`](0080-endpoint-troca-revela-conflito-forgot-password-nao.md) O endpoint de troca revela conflito (409), o `forgot-password` não
- [`0081`](0081-aviso-seguranca-vai-email-antigo-pedido-nao-confirmacao.md) O aviso de segurança vai para o email antigo, no pedido — não na confirmação
- [`0082`](0082-previousemail-reservava-endereco-sempre-parou-reservar.md) `PreviousEmail` reservava o endereço para sempre — e parou de reservar (D13, 8.6)
- [`0083`](0083-unique-previousemail-email-saiu-junto.md) O `@unique` de `PreviousEmail.email` saiu junto (K25)

- [`0084`](0084-email-como-servico.md) Email como serviço


### Contratos de API

> O que a API promete ao cliente. As rotas em si estão em
> [`reference/endpoints.md`](../reference/endpoints.md); o contrato formal é o
> `/openapi.json`, gerado dos próprios schemas Zod.

#### Onde o contrato vive

- [`0199`](0199-schemas-de-request-e-views-sao-codigo-do-contrato.md) Schemas de request e views são código do pacote `@pet-oasis/api-contracts` (11.10) — a API importa tudo do contrato; o que precisa de algo além de `zod` fica na API como composição

#### Views (presenter)

Cada recurso tem views resolvidas pela **capability do viewer** (não pelo role). `.parse()`
derruba campos não listados → nada sensível vaza por omissão.

- [`0085`](0085-whitelist-nao-blacklist.md) Whitelist e não blacklist
- [`0086`](0086-capability-nao-role.md) Por capability, não por role
- [`0087`](0087-user-progressao-capability.md) User — progressão por capability
- [`0088`](0088-views-dos-demais-recursos.md) Demais recursos
- [`0089`](0089-view-de-get-me.md) `GET /me`

#### Superfície pública

- [`0090`](0090-vitrine-catalogo-responde-sem-token.md) A vitrine do catálogo responde sem token (9.1)

#### Erros

422 VALIDATION_ERROR (`errors` por campo), 409 CONFLICT, 404 NOT_FOUND, 403 FORBIDDEN (`action`
nomeia a feature exigida), 401 UNAUTHORIZED. DELETE de recurso = 204 — tanto user quanto perfil; no
perfil o user continua existindo, só o `Customer`/`Employee` é soft-deletado.

- [`0091`](0091-p2002-handler-nao-check-antecipado.md) P2002 no handler, não check antecipado
- [`0092`](0092-validacao-sintatica-semantica.md) Validação sintática × semântica

#### Paginação

- [`0093`](0093-duas-estrategias-envelope-so.md) Duas estratégias, um envelope só
- [`0094`](0094-ordenacao-configuravel-so-offset.md) Ordenação configurável só no offset

#### Tipos

- [`0095`](0095-fronteira-featurename-string.md) A fronteira `FeatureName` × `string`


### Arquitetura

> O fluxo rígido (route → controller → service → repository) está no `CLAUDE.md`. Aqui ficam as
> decisões de encaixe: os pontos em que a regra foi testada e o que se decidiu quando ela
> conflitou com outra.

#### Roteamento

- [`0096`](0096-authenticate-saiu-app-ts-global-foi-grupo-rota.md) `authenticate` saiu do `app.ts` (global) e foi para o grupo de rota
- [`0097`](0097-optionalauthenticate-terceiro-modo-vitrine-publica.md) `optionalAuthenticate` — o terceiro modo, para a vitrine pública (9.6)

#### Onde cada coisa vive

- [`0098`](0098-gravacao-transacional-audit-vive-repository-service.md) A gravação transacional do audit vive no repository; o service passa o descritor
- [`0099`](0099-record-lib-observabilidade-nao-repository.md) `record` é lib de observabilidade, não repository
- [`0100`](0100-src-lib-nao-conhece-modulo-nenhum.md) `src/lib/` não conhece módulo nenhum
- [`0101`](0101-src-scripts-codigo-infra-agendamento.md) `src/scripts/` é código; `infra/` é agendamento
- [`0102`](0102-sql-cru-vive-exclusivamente-repository.md) SQL cru vive exclusivamente no repository
- [`0103`](0103-tsconfig-biome-api-estendem-presets-workspace.md) O tsconfig e o Biome da API estendem presets do workspace (11.3)
- [`0104`](0104-turborepo-pipeline-workspace-test-fica-fora-cache.md) O Turborepo é o pipeline do workspace; `test` fica fora do cache de propósito (11.4)
- [`0196`](0196-conventional-commits-escopo-obrigatorio-recusados-hook.md) Conventional Commits com escopo obrigatório, recusados no hook (11.5)
- [`0197`](0197-ci-verifica-so-afetado-services-do-job-no-lugar-do-compose.md) O CI verifica só o afetado, com os services do job no lugar do Compose (11.6)
- [`0198`](0198-contrato-consumido-do-fonte-ts-so-depende-de-zod-enum-dois-donos.md) O contrato é consumido do fonte TS e só depende de `zod`; enum tem dois donos e um teste (11.9)

#### Ordem de construção

- [`0105`](0105-perfis-antes-user-role.md) Perfis antes de user↔role
- [`0106`](0106-primitiva-repositorio-antes-rota-expoe.md) Primitiva de repositório antes da rota que a expõe
- [`0107`](0107-codigo-reaproveitado-entre-entrypoints-nao-pode-carregar.md) Código reaproveitado entre entrypoints não pode carregar auto-execução


### Segurança

> Complementa o ADR [`0003-rate-limiting-and-lockout.md`](0003-rate-limiting-and-lockout.md),
> que detalha o *como* (chaves, janelas, alternativas). Aqui fica o *porquê* das escolhas e o
> que a execução ensinou.

#### Rate limit e lockout

- [`0108`](0108-redis-nao-in-memory.md) Redis, não in-memory
- [`0109`](0109-rate-limit-ip-lockout-conta-sao-dois-mecanismos-nao.md) Rate limit por IP e lockout por conta são dois mecanismos, não um
- [`0110`](0110-lockout-hibrido-janela-fixa-backoff-exponencial.md) Lockout híbrido — janela fixa → backoff exponencial
- [`0111`](0111-checagem-lockout-entra-ramo-senha-correta.md) A checagem de lockout entra no ramo da senha CORRETA
- [`0112`](0112-configuracao-duas-env-vars-regra-nao-string-composta.md) Configuração: duas env vars por regra, não uma string composta
- [`0113`](0113-conta-travada-responde-429-generico.md) Conta travada responde 429 genérico
- [`0114`](0114-desbloqueio-manual-pelo-admin-reset-completo.md) Desbloqueio manual pelo admin, e reset completo
- [`0115`](0115-destravar-alvo-privilegiado-exige-ator-admin.md) Destravar alvo privilegiado exige ator admin
- [`0116`](0116-conta-demo-isenta-lockout.md) Conta demo isenta do lockout (8.8)
- [`0117`](0117-rate-limit-fluxos-novos-vive-service-nao-middleware.md) Rate limit dos fluxos novos vive no service, não em middleware (8.7)
- [`0118`](0118-admin-divide-balde-forgot-password.md) O admin divide o balde com o `forgot-password` (K27)
- [`0119`](0119-tres-rotas-publicas-token-ganharam-limite-juntas.md) As três rotas públicas de token ganharam limite juntas (K26)

#### Fail-open e o que a execução ensinou

- [`0120`](0120-fail-open-quando-redis-cai-risco-aceito-nao-esquecido.md) Fail-open quando o Redis cai é risco aceito, não esquecido
- [`0121`](0121-fail-open-nao-sai-graca-so-estar-decidido.md) O fail-open não sai de graça só por estar decidido (7.0)
- [`0122`](0122-isolamento-teste-redis-arquivo-nao-global.md) Isolamento de teste do Redis é por arquivo, não global

#### Hardening HTTP

- [`0123`](0123-trust-proxy-endereco-origem-nao-contagem-saltos.md) `trust proxy` é por endereço de origem, não por contagem de saltos (D7, revisto na 10.2)
- [`0124`](0124-corpo-grande-demais-413.md) Corpo grande demais é 413
- [`0125`](0125-cors-origem-nao-permitida-responde-sem-headers-nao-erro.md) CORS de origem não-permitida responde sem os headers, não com erro
- [`0126`](0126-allowlist-cors-sai-so-variavel-explicita-app-url-nao.md) A allowlist de CORS sai só da variável explícita — a `APP_URL` não entra por inércia (10.11)
- [`0127`](0127-mass-assignment-schema-update-strict-protecao-tem-teste.md) Mass assignment: schema de update é `.strict()`, e a proteção tem teste próprio (10.12)
- [`0128`](0128-todo-campo-texto-tem-teto-teto-contrato.md) Todo campo de texto tem teto, e o teto é contrato (10.13)
- [`0129`](0129-access-token-tem-algoritmo-pinado-iss-aud-obrigatorios.md) O access token tem algoritmo pinado, `iss`/`aud` obrigatórios e folga de relógio explícita (10.10)
- [`0130`](0130-auto-hospedar-bundle-scalar-vez-allowlistar-cdn.md) Auto-hospedar o bundle do Scalar em vez de allowlistar o CDN
- [`0131`](0131-auto-hospedagem-sozinha-nao-bastou-nonce-segunda-peca.md) A auto-hospedagem sozinha não bastou — o nonce é a segunda peça (7.1)
- [`0132`](0132-sobram-violacoes-csp-console-reference-elas-ficam.md) Sobram violações de CSP no console de `/reference`, e elas ficam


### Observabilidade

> A **política** (as três categorias lado a lado, taxonomia fechada de ações, dados proibidos,
> retenção) é fonte única em [`reference/logging-policy.md`](../reference/logging-policy.md) —
> não duplicar aqui. Este arquivo guarda o *porquê* das escolhas.

#### As três categorias

- [`0133`](0133-tres-categorias-de-log-nao-uma.md) Por que três e não uma
- [`0134`](0134-asynclocalstorage-excecao-consciente-explicit-over.md) `AsyncLocalStorage` é exceção consciente a "explicit over implicit"
- [`0135`](0135-ambiente-teste-nao-silencia-logger-ele-nao-monta-stdout.md) O ambiente de teste não silencia o logger — ele não monta o stdout
- [`0136`](0136-requestid-volta-cliente.md) O `requestId` volta ao cliente
- [`0137`](0137-rota-access-log-vem-contexto-nao-req-url.md) A rota do access log vem do contexto, não de `req.url`

#### Audit log

- [`0138`](0138-endpoint-leitura-decisao-anterior-revertida.md) Endpoint de leitura — decisão anterior revertida
- [`0139`](0139-read-audit-log-full-nao-role-como-ancora.md) `read:audit-log:full` e não uma role como âncora
- [`0140`](0140-escopo-12-18-primeira-leva.md) Escopo 12/18 na primeira leva (7.6)

#### Destinos

- [`0141`](0141-ring-buffer-existe-mesmo-havendo-axiom.md) O ring buffer existe mesmo havendo Axiom
- [`0142`](0142-axiom-sentry-entram-mesmo-sem-conta-configurada.md) Axiom e Sentry entram mesmo sem conta configurada

#### Higiene e resiliência

- [`0143`](0143-teto-sessoes-faxina-tokens-sao-higiene-nao-perda.md) Teto de sessões e faxina de tokens são higiene, não perda de auditoria
- [`0144`](0144-timeout-toda-dependencia-externa.md) Timeout em toda dependência externa (7.12)


### Infraestrutura

> Nenhuma regra de negócio vive aqui: é empacotamento, ambiente e dado de demonstração. O ADR
> [`0002-environments-and-deploy.md`](0002-environments-and-deploy.md) detalha a estrutura de
> Compose; o procedimento operacional está em [`guides/deploy.md`](../guides/deploy.md).

#### Ambientes

- [`0145`](0145-dois-bugs-motivaram-reformulacao.md) Os dois bugs que motivaram a reformulação (Fase 6)
- [`0146`](0146-compose-base-overrides.md) Compose base + overrides
- [`0147`](0147-servico-compose-chama-api-alias-rede-explicito.md) O serviço do Compose se chama `api`, com alias de rede explícito (10.1)
- [`0148`](0148-tres-redes-papeis-distintos-porta-api-despublicada.md) Três redes com papéis distintos, e a porta da API despublicada (10.2, revisto na 10.17)
- [`0149`](0149-envs-arquivo-dotenv-cli.md) Envs por arquivo + dotenv-cli
- [`0150`](0150-graceful-shutdown-nativo-compose-nao-script-spawn.md) Graceful shutdown nativo do Compose, não script com `spawn`
- [`0151`](0151-client-prisma-dev-num-volume-anonimo.md) O client Prisma do dev num volume anônimo

#### Imagem e boot de produção

- [`0152`](0152-migrate-deploy-nunca-migrate-dev.md) `migrate deploy`, nunca `migrate dev`
- [`0153`](0153-boot-dado-referencia-segue-demonstracao.md) O boot para no dado de referência e segue no de demonstração (10.3)
- [`0154`](0154-seed-bundlado-pelo-tsup-dist-seed-js.md) O seed é bundlado pelo tsup (`dist/seed.js`)
- [`0155`](0155-imagem-multi-stage-nao-root.md) Imagem multi-stage e não-root
- [`0156`](0156-contexto-build-raiz-monorepo-runtime-podado-pnpm-deploy.md) O contexto de build é a raiz do monorepo, e o runtime é podado por `pnpm deploy` (11.2)
- [`0157`](0157-pacotes-internos-entram-imagem-duas-camadas-deploy-nao.md) Os pacotes internos entram na imagem em duas camadas, e o `deploy` não precisa de `injectWorkspacePackages` (11.3)
- [`0158`](0158-openssl-vai-tres-estagios-imagem-engine-prisma-detectada.md) O OpenSSL vai nos três estágios da imagem, e a engine do Prisma é detectada (10.5)
- [`0159`](0159-nao-existe-script-apagar-banco-producao.md) Não existe script para apagar o banco de produção (10.5)
- [`0160`](0160-api-atende-num-subdominio-apex-fica-limpo.md) A API atende num subdomínio, e o apex fica limpo (10.6)
- [`0161`](0161-reverse-proxy-upload-existe-nao-neste-repositorio.md) O reverse proxy do upload existe, mas não neste repositório (9.10)
- [`0162`](0162-diretorio-uploads-mora-fora-working-tree-uid-fixado.md) O diretório de uploads mora fora do working tree, e o uid é fixado no serviço (10.4)
- [`0163`](0163-container-dev-escreve-como-uid-host-nao-como-root.md) O container de dev escreve como o uid do host, não como root (10.16)
- [`0164`](0164-sharp-arm64-exige-build-proprio-servidor.md) `sharp` no ARM64 exige build no próprio servidor (9.10)

#### Documentação da API

- [`0165`](0165-gerada-proprios-schemas-zod-nao-escrita-mao.md) Gerada dos próprios schemas Zod, não escrita à mão
- [`0166`](0166-presenters-garantem-doc-nao-vaza-segredo.md) Os presenters garantem que a doc não vaza segredo
- [`0167`](0167-openapi-json-reference-sao-publicas-router-topo.md) `/openapi.json` e `/reference` são públicas, no router de topo
- [`0168`](0168-token-colecao-bruno-usa-bru-setvar-nao-setenvvar.md) O token da coleção Bruno usa `bru.setVar`, não `setEnvVar`

#### Seeds e ambiente demo

- [`0169`](0169-role-demo-sempre-semeada-usuario-demo-atras-flag.md) Role `demo` sempre semeada, usuário demo atrás de flag
- [`0170`](0170-reset-demo-truncate-reseed-guarda-flag-explicita.md) Reset do demo é truncate+reseed, e a guarda é flag explícita
- [`0171`](0171-gotcha-reseed-compartilhado.md) Gotcha do reseed compartilhado (7.14)
- [`0172`](0172-limpeza-upload-prefixo-dono-nunca-raiz.md) A limpeza de upload é por prefixo de dono, nunca a raiz (9.11)
- [`0173`](0173-ordem-truncate-limpar-uploads-reseed.md) A ordem é truncate → limpar uploads → reseed (9.11)
- [`0174`](0174-dry-run-conta-arquivos-que-apagaria.md) O `--dry-run` conta os arquivos que apagaria (9.11)
- [`0175`](0175-demo-reset-esquecia-tabela-previousemail.md) `demo-reset` esquecia a tabela `previousEmail`

#### Dataset fake

- [`0176`](0176-duas-flags-independentes-seed-fake-data-seed-admin-user.md) Duas flags independentes: `SEED_FAKE_DATA` e `SEED_ADMIN_USER`
- [`0177`](0177-dataset-inclui-roles-escrita-manager-risco-assumido.md) O dataset inclui roles com escrita (`manager`), com o risco assumido
- [`0178`](0178-idempotencia-depende-so-email-fixo.md) A idempotência depende só do email fixo
- [`0179`](0179-instancia-propria-faker-desde-9-11-semeada-chave.md) Instância própria de Faker — e, desde a 9.11, semeada por chave
- [`0180`](0180-bytes-imagens-seed-moram-base64-num-ts-nao-disco.md) Os bytes das imagens do seed moram em base64 num `.ts`, não em disco (9.11)
- [`0181`](0181-seed-grava-imagem-pelo-adaptador-nunca-copiando-arquivo.md) O seed grava imagem pelo adaptador, nunca copiando arquivo (9.11)
- [`0182`](0182-seed-nao-cura-arquivo-sumido-quem-converge-demo-reset.md) O seed não cura arquivo sumido; quem converge é o `demo-reset` (9.11)
- [`0183`](0183-criado-via-userrepository-nao-via-user-service.md) Criado via `userRepository`, não via `user.service`

#### Achado de teste

- [`0184`](0184-cleardatabase-nao-era-bug.md) `clearDatabase` não era bug


### Domínio pet shop

> As decisões do Ciclo 2 nasceram já com ADR próprio (`0006`–`0010`), e o ADR é o dono do
> texto — o resumo e as notas de execução que o antigo índice temático guardava foram anexados
> ao fim de cada um. O passo-a-passo está no [`todo.md`](../../../../docs/todo.md) e o que ficou de fora, com o
> racional de exclusão, em [`reference/backlog.md`](../../../../docs/reference/backlog.md).

- [`0185`](0185-recorte-fase-9-unica-decisao-nao-tem-adr.md) O recorte da Fase 9 (a única decisão que não tem ADR)

#### Pets

[`0006`](0006-pet-domain-modeling.md), com resumo e notas de execução no fim do ADR.

#### Catálogo

[`0007`](0007-product-catalog-modeling.md), com resumo e notas de execução no fim do ADR.

#### Produto × serviço

[`0008`](0008-product-vs-service.md), com resumo e notas de execução no fim do ADR.

#### Busca textual

[`0009`](0009-text-search.md), com resumo e notas de execução no fim do ADR.

#### Upload de imagem

[`0010`](0010-file-storage-and-uploads.md), com resumo e notas de execução no fim do ADR.

#### Paginação do catálogo

[`0004`](0004-pagination.md), com resumo e notas de execução no fim do ADR.

#### Dataset fake do domínio (9.11)

O seed fake deixou de ser só usuários. A partir da 9.11, `SEED_FAKE_DATA` popula também **pets** e
**catálogo** — 9 marcas, 20 categorias em 3 níveis, 8 tags, 35 produtos com 51 variantes e 15 pets
em 12 donos —, para a demo mostrar a API funcionando em vez de listas vazias. O detalhe operacional
(base64, storage, `demo-reset`) vive nos ADRs de
[Infraestrutura](#infraestrutura); o que interessa ao domínio é **por que o dataset
tem a forma que tem**.

- [`0186`](0186-dataset-cobertura-cenario-nao-volume.md) O dataset é cobertura de cenário, não volume
- [`0187`](0187-costcents-todas-variantes.md) `costCents` em **todas** as variantes
- [`0188`](0188-pet-dono-soft-deletado-herda-deletedat-dono.md) O pet do dono soft-deletado herda o `deletedAt` do dono
- [`0189`](0189-arvore-chega-3-nivel-porque-service-defende-esse-limite.md) A árvore chega ao 3º nível porque o service defende esse limite
- [`0190`](0190-nome-mao-preco-sorteado-corpus-busca-motivo.md) Nome à mão, preço sorteado — e o corpus da busca é o motivo

#### O que o fecho da fase (9.12) corrigiu no catálogo

A revisão da fase inteira, feita **antes** da sincronização da documentação, achou cinco
defeitos. O motivo da ordem ficou provado no primeiro deles: o `endpoints.md` descrevia os
filtros como cumulativos, e não eram — documentar antes de revisar teria sido documentar uma
mentira.

- [`0191`](0191-preco-disponibilidade-caem-mesma-variante.md) Preço e disponibilidade caem na mesma variante
- [`0192`](0192-marca-nao-sai-produto-ativo-pendurado.md) Marca não sai com produto ativo pendurado
- [`0193`](0193-id-repetido-422-zod-nao-409-chave-composta.md) Id repetido é 422 do Zod, não 409 da chave composta
- [`0194`](0194-recusa-slug-forma-uuid-vale-tambem-derivado.md) A recusa de slug com forma de UUID vale também para o derivado
- [`0195`](0195-ultima-variante-ativa-decidida-sob-lock.md) A última variante ativa é decidida sob lock

---

## Como manter

- **Decisão nova é ADR novo**: próximo número, título que é a decisão e, em 1–3 frases ou o
  que ela pedir, contexto, decisão e porquê (formato em `ADR-FORMAT.md` da skill
  `domain-modeling`; um parágrafo basta). Depois, a linha
  correspondente aqui, na seção do tema — os dois juntos, senão a decisão fica inalcançável.
- **Decisão revertida é reescrita** narrando a reversão, no mesmo ADR — nunca duplicada como
  decisão + errata. Quando a reversão é grande, o ADR antigo ganha `Status: superseded by
  ADR-NNNN` e o novo conta a história.
- **Vocabulário não mora aqui**: termo e definição vão para o [`CONTEXT.md`](../../CONTEXT.md)
  da API. O ADR explica *por quê*; o glossário diz *o que é*.
- Depois de mexer em doc, `pnpm docs:check` na raiz prova que todo caminho e toda âncora
  citados existem.

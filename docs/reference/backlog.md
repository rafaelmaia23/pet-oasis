# Backlog — ideias para fases futuras

> Itens levantados durante o planejamento da Fase 7 e conscientemente **deixados de fora** dela, para manter o escopo fechável. Não é lista de desejos: cada item tem o problema que resolve e o custo estimado. Revisar nos fechos de cada fase (o que virou prioridade, o que deixou de fazer sentido).
>
> Legenda de esforço: **P** = uma sessão · **M** = uma feat-branch · **G** = fase própria.

---

## Segurança

### ~~Timing attack no login e enumeração de usuário~~ — ✅ resolvido (Fase 10.9)
Medido com o custo real do bcrypt: email desconhecido respondia em 5 ms e senha errada em 172 ms. O ramo sem conta passou a verificar contra um hash de ninguém (`simulatePasswordVerification`, `src/lib/password.ts`) e as medianas ficaram em 171 ms contra 172 ms. Racional e método da medição em `apps/api/docs/adr/0064-relogio-login-nao-oraculo-email-desconhecido-paga-bcrypt.md`.

### Resíduo de tempo no login: o contador de lockout só no ramo com conta — **P**
Depois da 10.9 sobra ~1 ms entre as duas recusas: o ramo com conta grava o contador de lockout no Redis (`lockout.recordFailure`) e o ramo sem conta não. Em rede local é ruído; em Redis remoto pode voltar a ser mensurável. **Correção possível:** uma escrita dummy no Redis no ramo sem conta, ou medir com o Redis de produção antes de decidir que não vale o custo. Decisão de produto, não tomada.

### ~~Comprimento máximo em todo campo de texto~~ — ✅ resolvido (Fase 10.13)
Catálogo e pet já tinham teto; faltavam identidade e sessão (email 254, senha conferida 100, token 64, CPF 14 e telefone 20 medidos no texto cru com máscara, `cursor` 128, `targetId` 36). Cada teto sai como `maxLength` no `/openapi.json` e tem teste no módulo. Racional em `apps/api/docs/adr/0128-todo-campo-texto-tem-teto-teto-contrato.md`.

### Teto para `User-Agent` e `X-Forwarded-For` antes de gravar em `Session`/`AuditLog` — **P**
A varredura da 10.13 cobriu campo de schema; os dois headers vão para o banco (`Session.userAgent`/`ipAddress`, `AuditLog.userAgent`/`ip`) sem teto próprio — o único é o do Node (`--max-http-header-size`, 16KB), e 16KB numa coluna de sessão por login é o mesmo lixo que o `.max()` evitou no corpo. **Correção:** truncar no `requestContext` (o único ponto que lê os dois) para um teto documentado, sem recusar a requisição — header grande não é erro do cliente que valha 4xx.

### Inteiro sem `.max()` estoura o `Int` do Postgres antes de virar 422 — **P**
`stockQuantity`, `weightGrams` e `volumeMl` da variante não têm teto: um valor acima de 2³¹−1 passa pelo Zod e morre no Prisma, que responde 500 em vez de 422. Não é texto, então ficou fora da 10.13. **Correção:** `.max()` coerente com o que o campo representa (estoque, peso e volume têm teto físico óbvio), com teste por schema como na 10.13.

### ~~Auditar mass assignment nos schemas de update~~ — ✅ resolvido (Fase 10.12)
Nenhum schema estava permissivo: todo update é `.strict()`, create e upsert descartam a chave desconhecida. O resultado foi só a suíte de regressão (`tests/integration/v1/mass-assignment.test.ts`, um caso por endpoint de escrita) e a regra de que schema de escrita novo entra nela no mesmo commit. Racional em `apps/api/docs/adr/0127-mass-assignment-schema-update-strict-protecao-tem-teste.md`.

### ~~Endurecer a verificação do JWT~~ — ✅ resolvido (Fase 10.10)
`algorithms: ["HS256"]`, `iss`/`aud` exigidos e `clockTolerance` de 5s, com emissão e verificação lendo as mesmas constantes em `src/lib/accessToken.ts`. O deploy invalida os access tokens em voo (não carregam `iss`/`aud`); o `refresh` recompõe o par. Racional em `apps/api/docs/adr/0129-access-token-tem-algoritmo-pinado-iss-aud-obrigatorios.md`.

### Bloquear senhas vazadas via HIBP — **M**
No signup e no change-password, consultar a API de range do Have I Been Pwned por *k-anonymity*: envia-se apenas os 5 primeiros caracteres do SHA-1 da senha, nunca a senha nem o hash completo. Gratuito e sem chave para esse endpoint. Puro polimento, mas é o tipo de detalhe que se nota numa revisão de código.

### HMAC com `PEPPER` no hash do refresh token — **P**
`Session.refreshTokenHash` guarda `sha256(token)` desde a Fase 3. Um HMAC com segredo no lugar do SHA-256 puro impediria que alguém de posse de um dump do banco verificasse *offline* se um token capturado (em log de proxy, em histórico de shell) pertence a uma sessão. Analisado no planejamento da Fase 7 e **recusado por ora**: com token de 32 bytes de entropia não há dicionário a montar, o ganho é marginal, e o custo é uma migration que invalida todas as sessões vivas — o hash antigo não é convertível. Retomar se o projeto passar a tratar sessão de usuário real, quando invalidar todo mundo uma vez deixa de ser gratuito e passa a ser um evento a se planejar de qualquer forma.

### Rotação de segredo do JWT com `kid` — **M**
Hoje a troca do segredo invalida todas as sessões de uma vez. Suportar múltiplas chaves com `kid` no header permite rotacionar sem derrubar ninguém. Só vale quando houver usuário real; até lá, o procedimento manual de rotação documentado já basta.

### Lock manual de conta pelo admin — **M**
A Fase 7.10 entrega só o *desbloqueio*; o lock acontece apenas automaticamente por tentativas erradas. Um lock manual (suspensão temporária sem o peso do ban) é um degrau intermediário útil, mas exige decidir como convive com `bannedAt` e `status` — o que reabre desenho de negócio já fechado.

### Auditar a leitura do audit log — **P**
Em ambiente regulado, consultar a trilha também gera linha na trilha. Aqui foi deixado de fora por ser ruído desproporcional ao risco (e porque a role `demo` lê a trilha por design). Retomar se o projeto ganhar dado real.

---

## Operação e confiabilidade

### `/health/ready` separado de `/status` — **P**
Hoje há um endpoint só. O ideal são dois papéis distintos: um público e mínimo (não vaza versão nem dependência), e um de readiness verificando Postgres e Redis, para o orquestrador saber quando pode mandar tráfego. Fica mais relevante quando houver mais de uma réplica.

### Cachear `test` no Turborepo — **M**
Da Fase 11 (issue 04), o `test` é a única task de verificação fora do cache: a suíte da API sobe Postgres e Redis via Compose e lê `.env.test`, inputs que o Turbo não vê, e um cache que os ignora devolve verde de outro ambiente. Cachear exige declarar esses inputs (`inputs` com os Compose e o `.env.example`, `env` com o que a suíte lê) e um teste negativo provando que mudar cada um invalida — o mesmo método que provou o `dependsOn` na 11.4. Só compensa quando a suíte deixar de caber num `pnpm test` de dois minutos ou quando o CI (issue 06) passar a rodá-la em todo PR.

### CI: supply chain e segredos — **M**
`pnpm audit` no pipeline, Dependabot ou Renovate ligado para dependências, e `gitleaks` varrendo o histórico atrás de segredo commitado por engano. Somar um `SECURITY.md` na raiz com o canal de reporte. Barato, e no contexto de portfólio comunica maturidade mais rápido que qualquer feature.

### Métricas e tracing (OpenTelemetry) — **G**
A Fase 7 entrega logs; falta o resto do tripé. Instrumentar com OTel deixaria o backend trocável por configuração (Axiom, Grafana, Honeycomb) em vez de acoplado a um SDK. Fase própria, e só compensa quando houver carga real para observar.

### Refresh automático do dicionário de lexemas — **P**
A correção de erro de digitação da busca (9.9) trabalha contra um dicionário materializado por `pnpm run db:refresh-search`. Produto criado pela API entra na busca **literal** na hora, mas suas palavras novas só passam a corrigir typo depois do próximo refresh — a defasagem existe e hoje não morde, porque quem popula o catálogo é o seed. **Correção:** um systemd timer em `infra/cron/`, no molde dos `cleanup-*`. **Gatilho:** catálogo alimentado por gente, não por seed.

### Systemd timer para a varredura de arquivos órfãos — **P**
O `db:cleanup-uploads` (9.10) nasceu sem agendamento: roda à mão, ao contrário dos outros dois `cleanup-*`, que têm timer em `infra/cron/`. **Gatilho:** o dia em que ela encontrar arquivo órfão duas vezes — antes disso, agendar é automatizar um problema que ainda não se provou existir.

### Subir `loginAsCatalogManager` para `tests/helpers/auth.ts` — **P**
A função (`buildEmployee({ roleNames: ["catalog-manager"] })` + `loginAs`) está copiada verbatim em seis arquivos de integração (`tag`, `category`, `product.variant`, `product.image`, `product.read`, `mass-assignment`). A convenção do projeto tolera a cópia por arquivo, mas seis é o limiar em que uma mudança na role do catálogo vira seis edições. **Correção:** um helper `loginAsRole(roleName)` em `tests/helpers/auth.ts`, e os seis arquivos passam a importá-lo. Mecânico, sem mudança de comportamento; ficou fora da 10.12 para não espalhar aquele diff por cinco arquivos alheios.

### Backup e restore do Postgres — **M**
Dump agendado do banco do deploy, com um *restore* de fato testado — backup nunca verificado não é backup. Complementa a política de retenção de logs.

---

## Produto e domínio

### ~~Dummy data para a demo~~ — ✅ resolvido (Fase 9.11)
O seed fake passou a cobrir o domínio inteiro sob a mesma flag `SEED_FAKE_DATA`: 9 marcas, 20 categorias em 3 níveis, 8 tags, 35 produtos com 51 variantes e imagem, e 15 pets em 12 donos, mais um funcionário de cada role nova da 9.1. O `demo-reset` trunca e repovoa o catálogo e limpa o diretório de upload, então a demo volta ao mesmo estado todo dia — com foto. O dataset é **cobertura de cenário**, não volume (produto sem imagem, esgotado parcial e total, folha de item único, pet falecido, pet de dono excluído), e cada cenário é afirmado por teste. Racional em `apps/api/docs/adr/README.md#dataset-fake-do-domínio-911` e `apps/api/docs/adr/README.md#infraestrutura`.

### ~~Ordenação configurável nas listagens~~ — ✅ resolvido (Fase 9.2)
`?sort=<campo>&order=asc|desc` entrou no helper de offset, com allowlist por recurso (fora dela → 422) e tiebreaker por `id` obrigatório também no offset. Primeiro consumidor: `GET /users`. Decisões de contrato no adendo de `apps/api/docs/adr/0004-pagination.md`. **A limitação do cursor permanece** — ordenar por campo ali exigiria a chave do cursor codificar o próprio campo de ordenação; se algum dia fizer falta, é entrada nova neste backlog.

### Transferência de pet entre clientes — **M**
Caso real (venda, doação, mudança de tutor de um pet já cadastrado). Deixado fora da Fase 9 por escopo — precisa de trilha de auditoria própria e de decisão sobre o que acontece com o histórico clínico do pet (que só existe quando a veterinária chegar). Levantado no planejamento da Fase 9.

### Múltiplos donos por pet — **G**
Família compartilhando o mesmo pet é caso real, mas a Fase 9 modela dono único (`Pet.customerId` obrigatório, sem N:N) — ver `apps/api/docs/adr/0006-pet-domain-modeling.md`. Gatilho de revisão: migrar `customerId` de FK direta para uma tabela de junção `PetOwner` (N:N), o que também reabre a pergunta acima (transferência de pet).

### `/me/pets` — **P**
Atalho de conveniência sobre `GET /customers/:customerId/pets`, evitando o cliente precisar primeiro resolver o próprio `customerId`. Fora da Fase 9 por duplicar rota/teste/documentação sem necessidade — `GET /me` devolve `customer.id`, que é tudo que o cliente precisa para chamar a rota aninhada. **Ressalva registrada na 9.4:** essa justificativa era falsa quando foi escrita — a view de `/me` **não** expunha `customer.id`, e a coleção aninhada era inalcançável pelo próprio dono. O campo foi acrescentado na 9.4 e a premissa agora é verdadeira; a lição é que um item de backlog justificado por uma capacidade existente precisa citar onde ela está no código.

### `StockMovement` (movimentação de estoque append-only) — **M**
A Fase 9 modela só `ProductVariant.stockQuantity` como número, sem movimentação, reserva ou histórico. Uma entidade `StockMovement` auditável é natural e desejável, mas só faz sentido na fase do pedido (Fase 10), que é onde a movimentação passa a ter causa (venda, devolução, ajuste manual).

### Imagem por variante (hoje é por produto) — **P**
`ProductImage` pertence ao `Product`, não ao `ProductVariant` (Fase 9, `apps/api/docs/adr/0007-product-catalog-modeling.md`). Imagem por variante é caso real ("cores diferentes" precisa; "mesmo saco, tamanhos diferentes" quase nunca precisa) mas adiciona complexidade que o domínio de pet shop raramente cobra.

### Teto da busca aplicado antes do recorte de visibilidade — **P**
A busca ranqueia no máximo 500 ids (9.9/Z9) e o SQL cru **não** filtra `deleted_at`/`status`, porque quem decide visibilidade é o `buildProductWhere` (Z4). Consequência: produto soft-deletado ou em rascunho consome cota do teto, e num catálogo com mais de 500 casamentos para o mesmo termo isso pode empurrar resultado visível para fora. Não morde no volume atual. **Correção quando morder:** paginação por keyset no próprio SQL, ou aceitar repetir `deleted_at IS NULL` lá — que é o primeiro passo da duplicação de "produto visível" que a Z4 recusou, e por isso não se faz sem motivo medido.

### `?q=` nas demais listagens do catálogo — **P**
A 9.9 põe busca textual **só** em `GET /products` (Z7). `/brands`, `/categories`, `/tags` e `/breeds` continuam sem `?q=`. Não é esquecimento: são listas curtas (dezenas de linhas), onde um `ILIKE` sobre o nome resolveria sem `tsvector`, coluna gerada, índice nem dicionário de lexemas — e replicar a infraestrutura da 9.9 por recurso multiplicaria o custo de manutenção pelo número de tabelas. **Gatilho:** alguém precisar filtrar essas listas por texto na interface; a correção é `ILIKE` com `f_unaccent` (a função já existirá desde a 9.9), não um segundo `tsvector`.

### Meilisearch/Typesense como motor de busca — **G**
A Fase 9 decide busca textual no Postgres nativo (`tsvector`+`unaccent`+`pg_trgm`, `apps/api/docs/adr/0009-text-search.md`), por escolha didática do usuário. Meilisearch/Typesense (typo tolerance por padrão, self-hosted) é a alternativa de mercado quando o volume justificar — custam um container a mais, um pipeline de sincronização produto→índice e uma segunda fonte de verdade que pode divergir do Postgres.

### Storage externo (S3/R2) para upload — **M**
A Fase 9 usa disco local atrás de um adaptador (`apps/api/docs/adr/0010-file-storage-and-uploads.md`), por restrição de custo (VPS ARM64, hospedagem própria) e intenção didática. O adaptador já deixa a porta aberta — trocar por S3/R2 é uma classe nova e uma env var. Gatilho: pressão de disco no VPS.

### Histórico de preço do produto — **G**
A Fase 9 guarda só o preço corrente (`ProductVariant.priceCents`). O congelamento de preço no pedido (Fase 10, já decidido: o item do pedido grava o preço no momento da compra) é outra coisa e é obrigatório — histórico de preço ao longo do tempo (para relatório, gráfico de variação) é o que fica de fora.

### Peso do pet como medição datada — **G**
`Pet.weightGrams` (Fase 9) é um instantâneo, não um histórico — o dono atualiza manualmente. Quando a veterinária chegar ao domínio, o peso vira uma medição datada no prontuário, e este campo passa a ser cache do último valor (ou é removido). Registrado para não reabrir a discussão de "por que o peso está no lugar errado" nessa hora.

### ~~Migração de token para cookie httpOnly~~ — ✅ resolvido fora deste repo (Fase 10)
O gatilho documentado ocorreu — o frontend próprio nasceu (`pet-oasis-web`) — e a resposta veio do lado dele, não daqui: o front adotou **BFF**, guardando a sessão num cookie `httpOnly` cifrado do **domínio dele**, de modo que o token nunca chega ao JavaScript do navegador. A API continua Bearer e continua sem CSRF no escopo, que era a contrapartida temida deste item. O ganho pretendido (armazenamento seguro, não depender do cliente fazer certo) foi obtido sem que a API trocasse de mecanismo — e é isso que a mantém universal para o app mobile planejado, que não usaria cookie. Item encerrado: se um segundo cliente de navegador aparecer sem BFF, ele reabre, mas como decisão daquele cliente.

---

## Conformidade

### LGPD: base legal, anonimização e direitos do titular — **G**
Deixado inteiramente fora da Fase 7 por o projeto ser portfólio, sem dado real de titular. Quando entrar, os pontos são: base legal para reter log de segurança (legítimo interesse / obrigação legal); o que acontece com `actorId` e `targetId` no `AuditLog` quando um usuário exerce direito de eliminação — hoje o soft delete **preserva** os dois; e o mecanismo de resposta a requisição de titular (exportação e eliminação). A tensão central é real: apagar destrói a trilha de segurança, manter conflita com o direito de eliminação, e a saída usual é **anonimizar** o ator preservando ação e timestamp.

## Bugs

### ~~Seed fatal derruba a aplicação no boot~~ — ✅ resolvido (Fase 10.3)
O entrypoint tratava falha de seed como fatal, e um `EACCES` ao gravar imagem de catálogo pôs a
API inteira em crash loop por causa de dado de demonstração. A proposta era "one-shot ou
fail-open"; a decisão foi fail-open **por classe de dado**, não em bloco: referência (features,
roles, raças, léxico da busca) continua fatal, porque é pré-requisito da API como a migration;
demonstração é fail-open, com `SEEDING COMPLETED WITH FAILURES: <passos>` nomeando o que falhou.
Fail-open no seed inteiro deixaria a API de pé com a tabela de autorização quebrada, escondida
numa linha de log. Racional em `apps/api/docs/adr/0153-boot-dado-referencia-segue-demonstracao.md`.

---

### `res.sendFile` do bundle do Scalar quebra em checkout sob caminho com ponto

**Problema:** `router.get(SCALAR_BUNDLE_PATH, …)` chama `res.sendFile(scalarBundleFile)` com o
caminho absoluto resolvido do `node_modules`. O `send` do Express recusa qualquer caminho que
tenha um **segmento começando com ponto** (`dotfiles: "ignore"`): devolve `NotFoundError`, que o
error handler central traduz em **500**. Em produção o caminho é `/app/node_modules/…` e nunca
morde; morde quem clona o repo sob um diretório pontuado — um worktree em `.claude/worktrees/`,
por exemplo, faz `tests/integration/v1/reference.test.ts` falhar com "expected 500 to be 200",
mensagem que não aponta para a causa. Encontrado na Fase 10.4.

**Proposta:** `res.sendFile(scalarBundleFile, { dotfiles: "allow" })` — o caminho não vem de
request nenhum, é resolvido do próprio `node_modules`, então a guarda de dotfile não está
protegendo nada aqui. Esforço: uma linha e um comentário dizendo por que é seguro.

---

### ~~`uploads/` dentro do working tree do repositório~~ — ✅ resolvido (Fase 10.4)

O diretório saiu para `/srv/pet-oasis-data/uploads` e **os dois** caminhos propostos foram
tomados, não um ou outro: o uid está fixado no serviço (`user: "1000:1000"`) *e* documentado no
guia, porque é o mesmo número dos dois lados e escrevê-lo num só deixaria o outro adivinhando.

Além do proposto, `uploads/.gitkeep` foi removido e o `.gitignore` passou a ignorar o diretório
inteiro: enquanto o git versionasse aquele caminho, ele continuaria dono dele em todo clone — era
justamente o `.gitkeep` que o `pull` não conseguia escrever. E `UPLOAD_HOST_DIR` perdeu o
fallback `:-./uploads`, que era o caminho silencioso de volta para dentro da árvore; faltando a
variável, o `prod:up` falha nomeando-a. Racional em `apps/api/docs/adr/0162-diretorio-uploads-mora-fora-working-tree-uid-fixado.md`.

---

### ~~Prisma não detecta libssl no runtime~~ — ✅ resolvido (Fase 10.5)

O `openssl` foi instalado — mas nos estágios `build` **e** `runtime`, não só no runtime que este
item propunha: a engine é escolhida duas vezes, no `npm ci` (onde o `@prisma/engines` baixa o
binário) e no boot (onde o CLI redetecta), e instalar num só faria os dois discordarem. O estágio
`dev` recebeu a mesma linha logo depois, fechando o item abaixo. O baked engine passou de
`schema-engine-debian-openssl-1.1.x` para `debian-openssl-3.0.x` e o boot ficou sem warning, com as
24 migrations aplicadas contra banco vazio na verificação. Custo: +2,34 MB líquidos. Racional em
`apps/api/docs/adr/0158-openssl-vai-tres-estagios-imagem-engine-prisma-detectada.md`.

---

### ~~O estágio `dev` da imagem ainda não detecta o libssl~~ — ✅ resolvido (logo após a 10.5)

A mesma linha de `apt-get`, antes do `npm ci`. Verificado com um `npm run dev` de verdade: o
`prisma generate` e o `migrate deploy` do entrypoint de dev não emitem mais `prisma:warn`, e o
schema-engine baked passou de `debian-openssl-1.1.x` para `debian-openssl-3.0.x`. A estimativa de
"~2 MB a mais" saiu errada de sinal: a imagem **encolheu** 2,66 MB (1368,56 → 1365,90 MB), porque a
engine 3.0.x é menor que a 1.1.x o bastante para pagar a camada do apt e ainda sobrar.

## Necessidades do front web

### ~~Janela de graça na rotação do refresh token~~ — ✅ resolvido (Fase 10.7, 10.15, 10.18)
Um refresh já consumido é aceito de novo por **10 segundos** a partir do `usedAt`, e a resposta é
o par que aquela rotação emitiu — mas **não** do jeito que este item propunha. A proposta era a
`Session` guardar "além do hash corrente, o hash anterior e o que foi emitido na troca", e isso
descrevia um modelo que não é o nosso: cada rotação **cria uma linha nova** e marca a anterior
como usada, então o hash anterior já está lá, numa linha própria. O que faltava era o **texto
claro** do par emitido, descartado no fim da requisição — e ele foi para o **Redis**, chaveado
pelo hash do token apresentado, com TTL igual à janela (`src/lib/refreshGrace.ts`). Sem migration,
sem segredo em coluna (que iria para backup e dump), e a janela imposta pelo TTL da infraestrutura
em vez de por comparação de timestamp, que erra sob clock skew. Cache sem resposta dentro da
janela é **503** retentável, nunca cascata. A 10.15 fez a graça seguir a corrente até a ponta viva
(o retardatário recebe o par **atual**, não um elo gasto), e a 10.18 acrescentou a marca
`graceDeferredAt` na linha para que a retentativa tardia de um 503 não seja lida como roubo. A
cascata fora das duas janelas continua intacta — a alternativa "invalidar só a sessão envolvida"
segue rejeitada pelo motivo de sempre. Racional em `apps/api/docs/adr/0057-janela-graca-10s-rotacao.md`.

### `enum` de `code` no schema do 403 do login — **P**

**Problema:** desde a 10.8 o `POST /auth/login` responde `ACCOUNT_BANNED`, `PASSWORD_RESET_REQUIRED`
ou `EMAIL_NOT_VERIFIED` no 403, e o OpenAPI os nomeia — mas só na **descrição** da resposta. O
schema continua sendo o `ErrorResponse` genérico (`code: string`), então um cliente que gera tipos
a partir da spec não ganha o union e volta a digitar os literais à mão. O guia de integração é o
contrato que o front lê, e ele já tem a tabela; o `enum` é polimento da spec gerada.

**Decisão a tomar:** dar ao 403 do login um schema próprio com `code: z.enum([...])` cria um
segundo componente de erro — precedente para outros endpoints com `code` por condição. Vale
decidir se a spec deve carregar esse nível de detalhe por rota, ou se a tabela do guia basta.

### `documenting-endpoints.md` lista só seis `errorResponses` e não fala de header — **P**

**Problema:** o guia de documentação de endpoints enumera `errorResponses[400|401|403|404|409|422]`,
mas o componente tem também 413 (9.10), 429 e 503 (10.7) — e, desde a 10.22, um componente de
erro pode declarar **header** (`Retry-After` no 429). Quem documenta uma rota nova pelo guia não
descobre que os três existem, nem que um header de resposta é declarável. Achado pela revisão de
código da 10.22, fora do diff.

**Esforço:** atualizar a lista e acrescentar um parágrafo sobre headers de resposta no componente
de erro. Uma issue.

### ~~IP do visitante atrás do front renderizado no servidor~~ — ✅ resolvido (Fase 10.2)
`req.ip` passou a vir do `X-Forwarded-For` por **endereço de origem**
(`app.set("trust proxy", ["loopback", "uniquelocal"])`), e não pelos **dois saltos** que este item
propunha: com o front renderizando no servidor existem duas cadeias vivas ao mesmo tempo
(`visitante → nginx → api` e `visitante → nginx → front → api`), e nenhuma contagem única acerta as
duas. A condição que o item já exigia — só confiar vindo da rede interna — virou a despublicação da
porta 3000 em produção, feita na mesma issue porque as duas são uma decisão só. Rate limit, lockout
e audit log voltam a ver o visitante; o cliente pode copiar o header ou acrescentar o próprio salto,
tanto faz. Três cadeias cobertas por teste em `tests/integration/v1/visitor-ip.test.ts`. Racional em
`apps/api/docs/adr/0123-trust-proxy-endereco-origem-nao-contagem-saltos.md` e `apps/api/docs/adr/0148-tres-redes-papeis-distintos-porta-api-despublicada.md`.

### ~~Apex passa a ser o front; API migra para `pet-oasis-api.maiahub.com.br`~~ — ✅ resolvido (Fase 10.6, 10.14)

**Motivo:** o front web (repo `pet-oasis-web`) tem mais valor de portfólio no apex do que a
referência Scalar — peça visual chama mais atenção que UI de documentação. A API não perde
nada indo para um subdomínio.

**O que muda:**

- **Nome**: `pet-oasis-api.maiahub.com.br`, de **primeiro** nível sob o domínio. A primeira
  versão escolheu `api.pet-oasis.maiahub.com.br`, e o handshake TLS falhou de fora: o DNS é
  proxiado pela Cloudflare, e o Universal SSL dela só cobre o apex e `*.maiahub.com.br`.
- **Reverse proxy**: proxy host no Nginx Proxy Manager para o nome novo, apontando ao container
  da API por DNS da rede `proxy`, com certificado Let's Encrypt por desafio DNS na Cloudflare e
  `real_ip_header CF-Connecting-IP; real_ip_recursive off;` na custom config (sem isso a borda
  da Cloudflare vira o IP de todo visitante). O apex passa a servir o container do front.
- **`.env.production`**: `APP_URL` → `https://pet-oasis.maiahub.com.br` (que agora é o front,
  que é o que essa variável sempre quis dizer) e `UPLOAD_PUBLIC_BASE_URL` →
  `https://pet-oasis-api.maiahub.com.br/uploads`.
- **Sem migration**: o banco guarda a chave do arquivo, nunca a URL (ADR
  `0010-file-storage-and-uploads.md`), então trocar a env var basta. A decisão daquele ADR paga
  dividendo aqui — e pagou duas vezes, porque a troca de nome também custou só a variável.
- **Sem mudança na spec**: `servers: [{ url: "/api/v1" }]` (`src/docs/openapi.ts:85`) é
  relativo e segue o host que serve o documento.
- **301 no apex — planejado e descartado**: a primeira versão previa `301` de `/reference` e
  `/openapi.json` para o subdomínio, para link publicado não morrer. A demo era quase não
  divulgada, e manter dois `location` para sempre num host que não é da API era resíduo sem
  dono. O apex fica limpo; quem tinha o link antigo troca a base.
- **Documentação**: README, badges, `apps/api/docs/guides/deploy.md` e `apps/api/docs/adr/0160-api-atende-num-subdominio-apex-fica-limpo.md`.

**Contrato de rotas com o front (a parte que não é infraestrutura):** quatro caminhos são
montados a partir de `APP_URL` e passam a ser obrigação do front, com estes nomes exatos —
`/verify-email`, `/reset-password`, `/confirm-email-change` e
`/confirm-account-reactivation`, todos com `?token=`. Renomear qualquer um deles no front
quebra o email correspondente sem erro visível em lugar nenhum.

**Ordem de execução, planejada e relaxada:** a regra era virar `APP_URL` para o apex só depois de
o front ter as quatro rotas no ar; na demo ela foi virada antes, por decisão do dono do projeto
(demo efêmera, sem conta real). O porquê, e por que a regra segue valendo para deploy com
usuários, em `apps/api/docs/adr/0160-api-atende-num-subdominio-apex-fica-limpo.md`.

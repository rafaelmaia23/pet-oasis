# Backlog — ideias para fases futuras

> Itens levantados durante o planejamento da Fase 7 e conscientemente **deixados de fora** dela, para manter o escopo fechável. Não é lista de desejos: cada item tem o problema que resolve e o custo estimado. Revisar nos fechos de cada fase (o que virou prioridade, o que deixou de fazer sentido).
>
> Legenda de esforço: **P** = uma sessão · **M** = uma feat-branch · **G** = fase própria.

---

## Segurança

### Timing attack no login e enumeração de usuário — **P**
Hoje, um email inexistente provavelmente responde em poucos ms, enquanto um email existente com senha errada gasta o tempo do hash (centenas de ms). Essa diferença vira um oráculo de existência de conta e anula o cuidado anti-enumeração já tomado em `forgot-password` e `verify-email/resend`. **Correção:** rodar a verificação de hash contra um hash dummy fixo quando o usuário não existe, igualando o tempo dos dois caminhos. Barato e fecha um furo real.

### Comprimento máximo em todo campo de texto — **P**
`express.json({ limit: "100kb" })` (Fase 7.0) protege o total do body, mas nada impede 99KB dentro de um campo `name`. Sem `.max()` nos schemas Zod isso vira lixo no banco, índice inchado e — agora que existe log estruturado — linhas de log gigantes. **Correção:** varredura em todos os schemas adicionando `.max()` coerente com a coluna do Prisma.

### Auditar mass assignment nos schemas de update — **P**
Confirmar que os schemas de update rejeitam (ou removem) chaves desconhecidas, para ninguém enviar `status`, `roleId`, `bannedAt` ou `mustChangePassword` no body de um update legítimo. Se já estiver coberto pelo comportamento default do Zod, o item vira apenas um teste de regressão explícito — que vale ter, porque é o tipo de proteção que se perde silenciosamente num refactor.

### Endurecer a verificação do JWT — **P**
Fixar `algorithms: ["HS256"]` na verificação (sem pinar, o token fica exposto a *algorithm confusion*), validar `iss` e `aud`, e definir tolerância de clock skew. Poucas linhas, vulnerabilidade de manual.

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

### CI: supply chain e segredos — **M**
`npm audit` no pipeline, Dependabot ou Renovate ligado para dependências, e `gitleaks` varrendo o histórico atrás de segredo commitado por engano. Somar um `SECURITY.md` na raiz com o canal de reporte. Barato, e no contexto de portfólio comunica maturidade mais rápido que qualquer feature.

### Métricas e tracing (OpenTelemetry) — **G**
A Fase 7 entrega logs; falta o resto do tripé. Instrumentar com OTel deixaria o backend trocável por configuração (Axiom, Grafana, Honeycomb) em vez de acoplado a um SDK. Fase própria, e só compensa quando houver carga real para observar.

### Backup e restore do Postgres — **M**
Dump agendado do banco do deploy, com um *restore* de fato testado — backup nunca verificado não é backup. Complementa a política de retenção de logs.

---

## Produto e domínio

### Dummy data para a demo — **M**
Hoje o seed cria o mínimo (roles, usuário demo). Um conjunto de dados fictício e coerente — clientes, pets, produtos, histórico — faz a demo mostrar a API funcionando em vez de mostrar listas vazias. Vira pré-requisito natural do `demo-reset` (Fase 7.14), que passaria a restaurar esse estado. **Agendado: a Fase 9 traz o domínio que faltava — resolvido na sessão 9.11 (`docs/todo.md`).**

### Ordenação configurável nas listagens — **P**
`?sort=` nas listas paginadas por offset. Simples com o helper da Fase 7.7; complexo no cursor (a chave do cursor teria que codificar o campo de ordenação). Fazer só para offset, e documentar a limitação. **Agendado: resolvido na sessão 9.2 da Fase 9 (`docs/todo.md`), com adendo já registrado em `docs/adr/pagination.md`.**

### Transferência de pet entre clientes — **M**
Caso real (venda, doação, mudança de tutor de um pet já cadastrado). Deixado fora da Fase 9 por escopo — precisa de trilha de auditoria própria e de decisão sobre o que acontece com o histórico clínico do pet (que só existe quando a veterinária chegar). Levantado no planejamento da Fase 9.

### Múltiplos donos por pet — **G**
Família compartilhando o mesmo pet é caso real, mas a Fase 9 modela dono único (`Pet.customerId` obrigatório, sem N:N) — ver `docs/adr/pet-domain-modeling.md`. Gatilho de revisão: migrar `customerId` de FK direta para uma tabela de junção `PetOwner` (N:N), o que também reabre a pergunta acima (transferência de pet).

### `/me/pets` — **P**
Atalho de conveniência sobre `GET /customers/:customerId/pets`, evitando o cliente precisar primeiro resolver o próprio `customerId`. Fora da Fase 9 por duplicar rota/teste/documentação sem necessidade — `GET /me` já devolve `customer.id`, que é tudo que o cliente precisa para chamar a rota aninhada.

### `StockMovement` (movimentação de estoque append-only) — **M**
A Fase 9 modela só `ProductVariant.stockQuantity` como número, sem movimentação, reserva ou histórico. Uma entidade `StockMovement` auditável é natural e desejável, mas só faz sentido na fase do pedido (Fase 10), que é onde a movimentação passa a ter causa (venda, devolução, ajuste manual).

### Imagem por variante (hoje é por produto) — **P**
`ProductImage` pertence ao `Product`, não ao `ProductVariant` (Fase 9, `docs/adr/product-catalog-modeling.md`). Imagem por variante é caso real ("cores diferentes" precisa; "mesmo saco, tamanhos diferentes" quase nunca precisa) mas adiciona complexidade que o domínio de pet shop raramente cobra.

### Meilisearch/Typesense como motor de busca — **G**
A Fase 9 decide busca textual no Postgres nativo (`tsvector`+`unaccent`+`pg_trgm`, `docs/adr/text-search.md`), por escolha didática do usuário. Meilisearch/Typesense (typo tolerance por padrão, self-hosted) é a alternativa de mercado quando o volume justificar — custam um container a mais, um pipeline de sincronização produto→índice e uma segunda fonte de verdade que pode divergir do Postgres.

### Storage externo (S3/R2) para upload — **M**
A Fase 9 usa disco local atrás de um adaptador (`docs/adr/file-storage-and-uploads.md`), por restrição de custo (VPS ARM64, hospedagem própria) e intenção didática. O adaptador já deixa a porta aberta — trocar por S3/R2 é uma classe nova e uma env var. Gatilho: pressão de disco no VPS.

### Histórico de preço do produto — **G**
A Fase 9 guarda só o preço corrente (`ProductVariant.priceCents`). O congelamento de preço no pedido (Fase 10, já decidido: o item do pedido grava o preço no momento da compra) é outra coisa e é obrigatório — histórico de preço ao longo do tempo (para relatório, gráfico de variação) é o que fica de fora.

### Peso do pet como medição datada — **G**
`Pet.weightGrams` (Fase 9) é um instantâneo, não um histórico — o dono atualiza manualmente. Quando a veterinária chegar ao domínio, o peso vira uma medição datada no prontuário, e este campo passa a ser cache do último valor (ou é removido). Registrado para não reabrir a discussão de "por que o peso está no lugar errado" nessa hora.

### Migração de token para cookie httpOnly — **G**
Trade-off já documentado e deferido no ADR de auth. Reabrir só se houver frontend próprio e o gatilho documentado ocorrer. Traria CSRF de volta ao escopo (hoje inexistente, por usar Bearer), então é decisão de arquitetura, não polimento.

---

## Conformidade

### LGPD: base legal, anonimização e direitos do titular — **G**
Deixado inteiramente fora da Fase 7 por o projeto ser portfólio, sem dado real de titular. Quando entrar, os pontos são: base legal para reter log de segurança (legítimo interesse / obrigação legal); o que acontece com `actorId` e `targetId` no `AuditLog` quando um usuário exerce direito de eliminação — hoje o soft delete **preserva** os dois; e o mecanismo de resposta a requisição de titular (exportação e eliminação). A tensão central é real: apagar destrói a trilha de segurança, manter conflita com o direito de eliminação, e a saída usual é **anonimizar** o ator preservando ação e timestamp.

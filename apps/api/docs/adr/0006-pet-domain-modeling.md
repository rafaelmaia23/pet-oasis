# Modelagem do domínio de pets

> Decisão de domínio registrada no planejamento da Fase 9 (sub-fases 9.3, 9.4).
> Primeiro recurso de domínio do projeto (Ciclo 2) — não altera nenhuma regra de
> negócio anterior, mas fixa convenções que o resto do catálogo (Fase 9) e a
> veterinária (fase futura) herdam.

## O problema

Até a Fase 8 o projeto não tinha nenhum recurso de domínio — só usuário, perfil e
autorização. `Pet` é o primeiro model que representa algo do negócio em si, e
carrega quatro decisões que custam caro para errar: como restringir a espécie, de
onde vem a lista de raças, o que significa um pet morrer (não deletar), e quantos
donos um pet pode ter.

## Decisão ✅

### Espécie como enum fechado, sem valor `OUTRO`

```prisma
enum PetSpecies { DOG CAT RABBIT BIRD RODENT REPTILE FISH }
```

Um enum no banco dá filtro confiável, relatório possível e dado que nasce limpo —
mesma escolha já feita em `UserStatus`/`ProfileKind`. A lista nasce
deliberadamente mais larga que o mínimo (sete espécies, não só cão/gato).

`OUTRO` foi considerado e recusado: parece flexibilidade, mas é um buraco
permanente na qualidade do dado — o pet fica sem raça válida, fora de todo filtro
útil, e a pressão seguinte é criar um `speciesOther` de texto livre, reintroduzindo
pela porta dos fundos exatamente o que o enum evitava. Adicionar um valor a um
enum no Postgres é `ALTER TYPE ... ADD VALUE`, uma migration barata — o custo de
"errar para o lado estreito" é baixo, e é o lado que se prefere errar.

### Raça como tabela semeada por constante, nunca API em runtime

```prisma
model Breed {
  id      String     @id @default(uuid())
  name    String
  species PetSpecies
  pets    Pet[]

  @@unique([species, name])
  @@map("breeds")
}
```

O caminho de aquisição do dado é: puxar **uma vez** de uma API pública de raças
(TheDogAPI/TheCatAPI e equivalentes), curar o resultado à mão (nomes em pt-BR,
remover duplicata e ruído), commitar como constante versionada, e **nunca mais
consultar a API**. Manutenção dali em diante é edição da constante — raça de
animal não muda com frequência. (O arquivo é
`src/modules/breed/breed.constants.ts` — ver a seção da 9.3 no fim deste
documento.)

Consultar a API em runtime foi recusado por três razões: colocaria a
disponibilidade da própria API refém de um terceiro (se ele cai ou faz rate
limit, o cadastro de pet quebra); não daria um id estável para usar como FK,
empurrando `Pet.breed` de volta para string livre; e a cobertura é ruim fora de
cão e gato, e em inglês.

O seed é idempotente pela chave `@@unique([species, name])`, mesmo padrão de
`DEFAULT_ROLES`/`DEFAULT_FEATURES`. Toda espécie com raça cadastrada precisa de
uma linha "SRD" (sem raça definida) semeada, senão o vira-lata não tem o que
selecionar.

### `SPECIES_WITH_BREED` é constante explícita, não derivada do dado

A regra "esta espécie exige raça?" vive numa constante explícita ao lado do
enum — **não** é derivada de "existe linha em `Breed` para esta espécie?". Parece
mais elegante derivar, e é traiçoeiro: no dia em que alguém semear a primeira
raça de peixe, todo pet-peixe já cadastrado passaria retroativamente a violar a
regra "raça obrigatória", sem que ninguém tenha mudado a regra de fato. Uma
constante explícita é testável, previsível e não tem efeito retroativo.

Consequência de schema: `Pet.breedId` é **nullable**. A obrigatoriedade é
semântica, resolvida no service: espécie em `SPECIES_WITH_BREED` exige
`breedId`; espécie fora dela exige `breedId` ausente. Os dois desvios são 422,
no mesmo shape de erro por campo que o projeto já usa. A raça informada também
precisa pertencer à espécie informada — validação semântica (precisa de banco),
não do Zod do controller.

### Dono único, sem N:N

`Pet.customerId` é obrigatório e não há tabela de junção. Família compartilhando
o mesmo pet é um caso real, mas foi deixado fora do escopo da Fase 9
(`docs/reference/backlog.md`) — modelar isso exigiria decidir também como funciona
transferência de pet entre clientes, o que é decisão de negócio própria, não um
efeito colateral da estrutura de dados.

### Falecimento é um estado, não uma exclusão

`Pet.deceasedAt` é separado de `Pet.deletedAt`. Um pet falecido continua
existindo na lista do dono, e todo o histórico futuro de prontuário (quando a
veterinária chegar) permanece válido e legível. Tratar falecimento como
exclusão destruiria informação clinicamente relevante e emocionalmente
significativa para o dono — os dois conceitos respondem perguntas diferentes
("este pet está vivo?" vs. "este registro deveria aparecer?").

### Peso é um instantâneo, não um histórico

`Pet.weightGrams` (inteiro, mesmo racional de preço em centavos — aritmética
sem ponto flutuante, sem `Decimal` do Prisma contaminando serialização/Zod) é
atualizado manualmente pelo dono/staff, sem histórico. Registrado aqui de
propósito: quando a veterinária entrar no domínio, o peso vira uma **medição
datada** no prontuário, e este campo vira cache do último valor (ou é
removido). Isso evita a discussão futura de "por que o peso está no lugar
errado" — a resposta já está escrita.

### `birthDateIsEstimated`

Caso real e frequente: um pet adotado cuja idade o dono só estima. Um booleano
ao lado de `birthDate` resolve sem forçar uma data falsa e sem duplicar a
informação num campo `approximateAge` paralelo — a idade continua derivada de
um único campo.

## Alternativas consideradas

- **Espécie como string livre:** filtro e relatório ficam inviáveis, e o dado
  suja rápido (variações de grafia). Preterido.
- **Raça consultada em API de terceiro a cada request:** ver acima — três
  problemas (disponibilidade, id instável, cobertura ruim). Preterido.
- **`SPECIES_WITH_BREED` derivada da existência de `Breed`:** efeito
  retroativo indesejado, ver acima. Preterido.
- **Múltiplos donos por pet desde já (N:N):** resolveria um caso real, mas
  reabre transferência de pet e trilha de auditoria própria — fora do escopo
  fechável da Fase 9. `docs/reference/backlog.md`.
- **Falecimento como soft delete comum:** perderia a distinção "vivo vs.
  registro visível" e destruiria a legibilidade do histórico futuro. Preterido.

## Quando revisitar

- Se surgir demanda real de família compartilhando pet: migrar `customerId`
  para uma tabela de junção `PetOwner`, e decidir transferência de pet junto
  (mesmo gatilho, `docs/reference/backlog.md`).
- Quando a veterinária entrar no domínio: `weightGrams` deixa de ser campo
  único e vira medição datada no prontuário.
- Se uma espécie sem raça cadastrada hoje (peixe, réptil) ganhar uma lista
  curada: adicionar ao `SPECIES_WITH_BREED` é uma decisão explícita, nunca
  automática.

## O que a implementação (9.3) firmou além da decisão

A sub-fase 9.3 executou a parte de espécie/raça deste ADR (o `Pet` em si é a
9.4) e fechou cinco pontos que o texto acima não especificava.

| # | Ponto | Escolha e por quê |
|---|---|---|
| T1 | Quem entra em `SPECIES_WITH_BREED` | **Só `DOG` e `CAT`.** O corpo do ADR dizia "cão e gato têm listas curadas; peixe e réptil, não" e deixava coelho, ave e roedor em aberto. Ficaram de fora: em ave e roedor o que existe não é raça, é espécie ou variedade (calopsita, periquito; hamster sírio × anão russo), e enfiar isso em `Breed` misturaria dois conceitos — além de obrigar todo dono de ave a escolher um valor que não é raça. Coelho tem raças de fato, mas entrar exigiria curar mais uma lista sem demanda que a justifique. As outras cinco espécies exigem `breedId` **ausente** (422 na 9.4). |
| T2 | Contrato do `GET /breeds` | `?species=` **opcional** (sem ele sai o catálogo inteiro — ~140 linhas fixas, que é o que o seed fake e a coleção Bruno consomem), **sem paginação**, envelope `{ data, meta: {} }` via `listEnvelope`. Mesma classe de `GET /roles` e `GET /features` na tabela do [`0004`](0004-pagination.md). Espécie fora do enum → **422** nomeando `species`. Rota **pública**, sem `authenticate` nem feature (9.1/N15); como não tem view por capability, não depende da autenticação opcional que `/products` vai exigir na 9.6. |
| T3 | `Breed` é dado de referência | `clearDatabase()` **não** o trunca (como `Feature`/`Role`/`RoleFeature`), e `demo-reset` também não. Consequência prática: os testes de pet da 9.4 encontram as raças já semeadas pelo `globalSetup`, sem setup próprio. Provado por `tests/integration/clearDatabase.guard.test.ts`. |
| T4 | Onde a constante mora | **`src/modules/breed/breed.constants.ts`**, e não `src/lib/seed/` como dizia a redação original deste ADR. O que decide é `SPECIES_WITH_BREED`: ela é lida em **runtime** pelo `pet.service` (9.4), e um service de domínio importando do diretório de seed seria arquivo no lugar errado. Também é o que o `CLAUDE.md` já manda ("constantes de domínio em `*.constants.ts`, lidas pelo seed") e o que os próprios `DEFAULT_ROLES`/`DEFAULT_FEATURES` — nomeados aqui como o padrão a seguir — fazem. `src/lib/seed/` guarda dado fake/demo e rotinas, não o catálogo canônico. |
| T5 | Forma do seed | `createMany({ skipDuplicates: true })`, **não** `upsert` em laço. `upsert` existe para `Role`/`Feature` porque elas têm campo mutável (`description`, `appliesTo`, vínculos); `Breed` não tem **nenhum** — `species` e `name` *são* a chave, então não há o que atualizar numa linha existente. Uma ida ao banco em vez de ~140, e ainda assim exatamente "idempotente por `@@unique([species, name])`". E, deliberadamente, **sem o delete reconciliador** que `runSeed` aplica às features: a partir da 9.4 `Pet.breedId` referencia estas linhas, e apagar uma raça que ainda tem pet quebraria o seed no boot do container (que roda `migrate deploy → seed → start` a cada restart). Remover raça do catálogo é migration deliberada. |

Números da entrega: 142 raças (96 de cão, 46 de gato), cada espécie com a sua
linha `SRD`.

## O que a implementação (9.4) firmou além da decisão

A sub-fase 9.4 construiu o `Pet` em si — model, CRUD e escopo — e fechou as duas
pendências de negócio que o planejamento tinha deixado em aberto — a unicidade
de `microchipId` (U1) e o destino dos pets de um cliente soft-deletado (U2) —,
mais dois pontos de contrato que o corpo deste ADR não especificava.

| # | Ponto | Escolha e por quê |
|---|---|---|
| U1 | Unicidade de `microchipId` | **`@unique` global**, valendo também para a linha soft-deletada — o precedente já firmado em `User.email`, `User.cpf` e `Customer.phone`. Descartados o índice parcial (`WHERE deleted_at IS NULL`, migration à mão, primeira exceção ao padrão) e a validação no service (que devolveria a unicidade ao código, contra o "unicidade é do banco" do `CLAUDE.md`, e ainda abriria corrida entre o check e a escrita). O efeito colateral — um pet excluído prende o número para sempre — é, num identificador do **mundo real**, o comportamento certo: é o sinal "este pet já foi cadastrado aqui". Duplicata sai como **409** pelo handler de P2002, sem código novo. `NULL` não colide, então pet sem chip não é afetado. |
| U2 | Pets de um cliente soft-deletado | **Descem na cascata e voltam por correlação de data**, como `UserRole`. `Pet` é o primeiro filho de **domínio** do grafo de `user.lifecycle.repository.ts` — entra porque D1 não admite filho ativo de pai morto, não porque seja privilégio. É essa distinção que decide a volta: a assimetria da restauração (D6' — desce quatro níveis, sobe dois) existe contra **vazamento de privilégio**, e devolver a ficha do bichano ao dono não concede autoridade nenhuma; *não* devolvê-la seria perda de dado, sem endpoint de restauração de pet que a compensasse. Pet que o dono excluiu **antes**, de propósito, não volta: o `deletedAt` dele não bate com o do perfil, e a regra recursiva já existente basta. As contagens entram no audit (`cascadedPets`, `restoredPets`) pelo mesmo critério de `cascadedOverrides` — a cascata derruba coisa que não aparece na resposta 204. |
| U3 | Como se marca o falecimento | **Rota própria** `POST`/`DELETE /pets/:petId/deceased`, no idioma de `POST`/`DELETE /users/:id/ban`: transição de estado com significado e ação de audit (`PET_DECEASED`) próprios não é campo de update. `deceasedAt` fica **fora** do `PATCH` (422 se vier no corpo). O `POST` é idempotente — remarcar não reescreve a data já registrada, senão um clique repetido apagaria a informação verdadeira —, e o `DELETE` existe porque marcar o pet errado é erro real e sem ele viraria dado permanente. A feature continua sendo `manage:pet` comum (9.1). |
| U4 | O que o `PATCH` aceita | Tudo menos `customerId` (transferência de pet é backlog: exige trilha própria e decisão sobre o histórico clínico), `deceasedAt` (U3) e `photoPath` (upload, 9.10). **`species` é editável**, porque erro de cadastro é caso real e a alternativa — excluir e recriar — perderia o `createdAt` e, no futuro, o prontuário. A consequência é que a validação de raça corre sobre o **estado resultante** (`body.species ?? pet.species`), não sobre o corpo isolado: trocar a espécie sem ajustar a raça no mesmo `PATCH` é 422. |
| U5 | Onde o escopo é decidido, e o que responde o alvo inexistente | O dono de um pet **não está na URL** — `/customers/:customerId` traz o id do *perfil*, e `/pets/:petId` não traz dono nenhum —, então "autorizar antes de buscar" não se aplica ao pé da letra. O que preserva o princípio é o alvo inexistente **falhar fechado**: sem `:others`, um `customerId`/`petId` que não existe responde **403**, igual ao alheio. Distinguir 403 de 404 ali transformaria a rota em oráculo de existência para qualquer cliente logado. Com `:others`, o 404 volta a ser 404. |

Dois achados corrigidos junto, ambos anteriores à sessão:

- **`GET /me` não devolvia `customer.id`.** A decisão de recusar `/me/pets`
  (`docs/reference/backlog.md`) se apoiava explicitamente em "o `GET /me` já
  devolve `customer.id`, que é tudo que o cliente precisa" — e não devolvia. Sem
  o campo, a coleção aninhada era **inalcançável pelo próprio dono**. O id de
  perfil entrou nas views de `me` e na `owner` de `user` (cliente e funcionário,
  por simetria).
- **A taxonomia de alvo do audit existia em duplicata:** a union
  `AuditTargetType` e um `z.enum([...])` escrito à mão no schema do filtro de
  `GET /audit-logs`. Acrescentar um alvo e esquecer o segundo não quebrava o
  build — só fazia `?targetType=` recusar em silêncio um valor legítimo. As duas
  passaram a derivar de `AUDIT_TARGET_TYPES`, com teste de regressão.

## O que a implementação (9.5) firmou além da decisão

A sub-fase 9.5 acrescentou a **listagem geral de balcão** (`GET /pets`) — a
primeira leitura de pet que não parte de um dono conhecido. Três pontos de
contrato foram decididos com o usuário; nenhum deles altera o modelo.

| # | Ponto | Escolha e por quê |
|---|---|---|
| V1 | Pet falecido na listagem geral | Filtro `?deceased=true\|false`, e **sem o parâmetro a lista traz os dois**. O caminho alternativo — excluir falecidos por default, deixando a lista de balcão limpa — foi recusado porque um default que esconde linha faz `meta.total` mentir sobre o tamanho da base e obriga quem audita a saber de um filtro implícito. Aqui o default é "tudo que existe", e quem quer o recorte operacional manda `?deceased=false`. Fica coerente com a listagem do dono (9.4), que também traz o falecido — lá porque o critério é afetivo, aqui porque o default é honesto. |
| V2 | Allowlist de filtros | `species`, `sex`, `customerId`, `breedId`, `microchipId`, `neutered`, `deceased`. Valor fora do enum é **422** nomeando o campo (o filtro estrito da 7.7); chave desconhecida é ignorada, como em `GET /users` — a estrita ali é a *allowlist de valores*, não a de chaves. `customerId` e `breedId` são **filtro, não resolução de recurso**: um uuid bem-formado que não existe devolve lista vazia com `total: 0`, nunca 404 — mesmo comportamento de `?role=` em `GET /users`, e o que evita que a listagem vire oráculo de existência de perfil. `microchipId` é busca exata: como o campo é unique global (U1), o filtro devolve no máximo uma linha, que é o caso de balcão "achei o bicho, quero o dono". |
| V3 | Allowlist de ordenação | `createdAt` (natural `desc`, é o default), `name` (`asc`), `species` (`asc`). `birthDate` ficou de fora porque é anulável e convive com `birthDateIsEstimated` — ordenar por ele empilharia os nulos numa ponta e misturaria data real com estimada. `species` é enum do Postgres e ordena pela **ordem de declaração** do `PetSpecies`, não alfabeticamente: quem quer agrupar previsivelmente usa o filtro. |

Duas assimetrias deliberadas ficaram registradas no
`docs/reference/endpoints.md` junto com as rotas:

- **Só uma das duas coleções pagina.** `GET /customers/:customerId/pets`
  continua sem paginação (`meta {}`), porque a coleção já é limitada pelo dono;
  `GET /pets` pagina por offset porque varre a base inteira. Quem quer os pets de
  um cliente paginados usa `GET /pets?customerId=`.
- **Só uma das rotas do módulo exige a forma `:others` direto.** As demais
  declaram a forma base e deixam o `pet.service` separar dono de staff (U5). Em
  `GET /pets` não há o que separar — listar pet de terceiro *é* a rota —, então a
  feature vai na rota, como `read:user:others` em `GET /users`, e o service não
  recebe ator.

---

## Resumo e notas de execução (migrados do índice de contexto em 2026-09-18)

> Este bloco vivia no índice temático **Domínio pet shop** como resumo deste ADR e registro do que a
> implementação firmou além da decisão. Migrado sem edição; só os links foram reapontados.

- Espécie como **enum fechado sem `OUTRO`** — por que a lista nasce mais larga que o mínimo e por
  que `OUTRO` é buraco permanente, não flexibilidade
- Raça como **tabela semeada por constante, nunca API em runtime** (TheDogAPI/TheCatAPI
  descartadas: disponibilidade refém de terceiro, sem id estável para FK, cobertura ruim fora de
  cão e gato)
- `SPECIES_WITH_BREED` é constante **explícita**, não derivada do dado — derivar faria pets já
  cadastrados violarem a regra retroativamente
- **Dono único** (`Pet.customerId` obrigatório, sem N:N), com o gatilho de revisão registrado
- **Falecimento é estado, não exclusão** (`deceasedAt` separado de `deletedAt`)
- Peso é instantâneo, não histórico · `birthDateIsEstimated`
- **O que a 9.3 firmou** (§ "O que a implementação (9.3) firmou além da decisão" do mesmo ADR):
  só `DOG` e `CAT` em `SPECIES_WITH_BREED` — ave e roedor têm variedade, não raça; contrato do
  `GET /breeds` (público, `?species=` opcional, sem paginação); `Breed` é dado de **referência**
  (sobrevive ao `clearDatabase` e ao `demo-reset`); a constante mora em
  `src/modules/breed/breed.constants.ts` e não em `src/lib/seed/`; e o seed usa `createMany` com
  `skipDuplicates`, **sem** delete reconciliador — apagar raça com pet quebraria o boot
- **O que a 9.4 firmou** (§ "O que a implementação (9.4) firmou além da decisão" do mesmo ADR):
  `microchipId` com `@unique` **global** (U1, precedente de email/cpf/phone — o chip preso por um
  pet excluído é o sinal certo num identificador do mundo real); pets **cascateiam e voltam por
  correlação de data** (U2 — ver [`0047`](0047-pet-primeiro-filho-dominio-grafo.md));
  falecimento em **rota própria** e idempotente (U3); `species` editável, com a raça revalidada
  sobre o estado resultante (U4); e o alvo inexistente **falhando fechado** em 403 quando o ator
  não tem `:others` (U5)
- **O que a 9.5 firmou** (§ "O que a implementação (9.5) firmou além da decisão" do mesmo ADR):
  `GET /pets`, a listagem de balcão, traz vivos **e** falecidos por default — `?deceased=` é o
  recorte, não o default, para que `meta.total` não minta (V1); allowlist de filtros com
  `customerId`/`breedId` funcionando como **filtro e não resolução de recurso** (uuid inexistente
  → lista vazia, nunca 404) e `microchipId` como busca exata de balcão (V2); allowlist de
  ordenação `createdAt`/`name`/`species`, com `birthDate` recusado por ser anulável e estimável
  (V3). Duas assimetrias deliberadas: só `GET /pets` pagina (a coleção do dono continua com
  `meta {}`) e só ela exige `read:pet:others` direto na rota

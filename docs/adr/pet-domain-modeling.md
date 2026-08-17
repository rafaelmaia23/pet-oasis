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
| T2 | Contrato do `GET /breeds` | `?species=` **opcional** (sem ele sai o catálogo inteiro — ~140 linhas fixas, que é o que o seed fake e a coleção Bruno consomem), **sem paginação**, envelope `{ data, meta: {} }` via `listEnvelope`. Mesma classe de `GET /roles` e `GET /features` na tabela do [`pagination.md`](pagination.md). Espécie fora do enum → **422** nomeando `species`. Rota **pública**, sem `authenticate` nem feature (9.1/N15); como não tem view por capability, não depende da autenticação opcional que `/products` vai exigir na 9.6. |
| T3 | `Breed` é dado de referência | `clearDatabase()` **não** o trunca (como `Feature`/`Role`/`RoleFeature`), e `demo-reset` também não. Consequência prática: os testes de pet da 9.4 encontram as raças já semeadas pelo `globalSetup`, sem setup próprio. Provado por `tests/integration/clearDatabase.guard.test.ts`. |
| T4 | Onde a constante mora | **`src/modules/breed/breed.constants.ts`**, e não `src/lib/seed/` como dizia a redação original deste ADR. O que decide é `SPECIES_WITH_BREED`: ela é lida em **runtime** pelo `pet.service` (9.4), e um service de domínio importando do diretório de seed seria arquivo no lugar errado. Também é o que o `CLAUDE.md` já manda ("constantes de domínio em `*.constants.ts`, lidas pelo seed") e o que os próprios `DEFAULT_ROLES`/`DEFAULT_FEATURES` — nomeados aqui como o padrão a seguir — fazem. `src/lib/seed/` guarda dado fake/demo e rotinas, não o catálogo canônico. |
| T5 | Forma do seed | `createMany({ skipDuplicates: true })`, **não** `upsert` em laço. `upsert` existe para `Role`/`Feature` porque elas têm campo mutável (`description`, `appliesTo`, vínculos); `Breed` não tem **nenhum** — `species` e `name` *são* a chave, então não há o que atualizar numa linha existente. Uma ida ao banco em vez de ~140, e ainda assim exatamente "idempotente por `@@unique([species, name])`". E, deliberadamente, **sem o delete reconciliador** que `runSeed` aplica às features: a partir da 9.4 `Pet.breedId` referencia estas linhas, e apagar uma raça que ainda tem pet quebraria o seed no boot do container (que roda `migrate deploy → seed → start` a cada restart). Remover raça do catálogo é migration deliberada. |

Números da entrega: 142 raças (96 de cão, 46 de gato), cada espécie com a sua
linha `SRD`.

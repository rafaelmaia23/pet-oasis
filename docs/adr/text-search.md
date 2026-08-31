# Busca textual do catálogo: Postgres nativo, não `ILIKE` nem motor externo

> Decisão registrada no planejamento da Fase 9 (sub-fase 9.9). Escolha do
> usuário, explicitamente contra a recomendação inicial deste documento (que
> era começar com `ILIKE`). Introduz SQL cru no repository do módulo de
> produto — único ponto do projeto onde isso acontece.

## O problema

`GET /products?q=` precisa encontrar "Ração Golden Adulto" quando alguém
digita "racao golden" (sem acento) ou "golen" (erro de digitação). Um `LIKE`/
`ILIKE` simples resolve o caso sem acento só com `unaccent`, mas não tem
nenhuma tolerância a erro de digitação, nem ranking por relevância, nem
suporte a radical de palavra ("rações" não encontra por "ração").

## Decisão ✅

### Postgres nativo — `tsvector` + `unaccent` + `pg_trgm`

Não existe biblioteca Node que resolva tolerância a erro de digitação — essa
camada é do banco ou de um motor de busca dedicado. A decisão foi
explicitamente **didática**: o objetivo declarado pelo usuário é aprender a
construir busca com tolerância a typo, não entregar o mínimo que funciona (que
seria `ILIKE` + `unaccent`, suficiente para o volume real do projeto).

Cada peça resolve uma coisa:

| Peça | Resolve |
|---|---|
| `tsvector`/`tsquery`, dicionário `portuguese` | radical ("rações" acha "ração"), stopwords, ranking por relevância (`ts_rank`) |
| `unaccent` | "racao" acha "ração" |
| `pg_trgm` (similaridade por trigrama) | erro de digitação: "golen", "raçao", "royal canim" |

**Estratégia de consulta:** este documento previa duas saídas — full-text com
fallback para trigrama, ou pontuação combinada numa query só — e deixava a
escolha para a sub-fase 9.9. O kickoff da 9.9 **não escolheu nenhuma das
duas**: adotou uma terceira, a reescrita da query por dicionário de lexemas.
Ver "O que o kickoff da 9.9 firmou" abaixo, e em especial a Z5, que explica por
que as duas previstas foram preteridas.

### Meilisearch/Typesense como alternativa descartada, não eliminada

A resposta de mercado quando o volume justifica é Meilisearch ou Typesense
(typo tolerance por padrão, self-hosted, roda em ARM64). Descartados aqui
porque custam um container a mais, um pipeline de sincronização
produto→índice, e uma segunda fonte de verdade que pode divergir do Postgres.
Ver "Quando revisitar" para o gatilho.

### Armadilhas conhecidas — documentadas para não custarem uma tarde cada

1. **`unaccent` não é `IMMUTABLE`, é `STABLE`** — e coluna gerada
   (`GENERATED ALWAYS AS ... STORED`) exige função imutável. Saída padrão:
   criar um wrapper marcado `IMMUTABLE` sobre `unaccent`, ou manter a coluna
   por trigger. **Fechada na 9.9 (Z8): wrapper `f_unaccent`.** É uma mentira
   consciente — marcar como imutável uma função que o Postgres classifica como
   `STABLE` —, segura porque o dicionário `unaccent` não muda em produção, e
   perigosa se alguém editar o `unaccent.rules`, porque as colunas geradas não
   seriam reconstruídas.
2. **Extensões precisam de `CREATE EXTENSION`** em migration escrita à mão —
   o Prisma não as declara. Isso afeta dev, test e prod igualmente: o
   container de teste precisa das extensões, ou metade da suíte quebra por um
   motivo que não parece ser esse.
3. **Índices:** GIN sobre a coluna `tsvector`; GIN com `gin_trgm_ops` sobre o
   texto para a similaridade. Sem eles, a busca funciona e é lenta — e a
   lentidão só aparece com volume, ou seja, depois do deploy.
4. **Prisma e SQL cru:** a busca sai por `$queryRaw` com template
   parametrizado (nunca concatenação — `q` vem do usuário). O corte de
   camadas se mantém: **quem escreve SQL cru é o repository**, e ele devolve
   dado, não linha de banco crua vazando para cima.
5. **`websearch_to_tsquery`** é mais tolerante a entrada humana que
   `to_tsquery` (que explode com sintaxe inválida) — preferir.
6. **Limiar de similaridade** (`pg_trgm.similarity_threshold`/`set_limit`) é
   sessão-scoped no Postgres; com pool de conexões, precisa ser definido por
   query, não por sessão. **Honrada na 9.9 (Z13):** o limiar é `0.4`, passado
   na própria query de correção, dentro de `product.search.repository.ts`.

### O que buscar

Nome do produto, nome da marca, descrição — com pesos diferentes
(`setweight`: nome pesa mais que descrição). Tags são candidatas naturais
também.

### Testes

A sub-fase de maior risco de teste frouxo do projeto. O teste tem que afirmar
comportamento observável — "buscar `racao golden` encontra o produto 'Ração
Golden Adulto'", "buscar `golen` (com typo) encontra", "buscar `xyzabc` não
encontra", "resultado mais relevante vem primeiro" — e não a forma da query.

## O que o kickoff da 9.9 firmou (Z1–Z17)

> Adendo de 2026-08-31. Dezessete decisões tomadas com o usuário **antes** de qualquer
> código. A tabela completa vive em `docs/todo.md`, no bloco da sessão 9.9; aqui ficam as
> quatro que mudam ou fecham o que este documento dizia.

### Z5 — o typo é corrigido *na query*, não compensado no ranking

As duas estratégias que este ADR previa falham no mesmo lugar: uma query com **uma palavra
certa e uma errada**. `websearch_to_tsquery('racao golen')` monta `racao & golen`, e o `E`
derruba tudo — o fallback então compara a frase inteira contra o documento inteiro, com
similaridade baixa, e a pontuação combinada precisa que a parcela de trigrama carregue
sozinha um resultado que o full-text já rejeitou.

A saída adotada é a receita clássica de correção ortográfica do Postgres: manter a lista de
**lexemas que existem no catálogo** (view materializada sobre os `tsvector`, com índice
trigrama) e, na busca, conferir **palavra a palavra**. Palavra que existe passa intacta;
palavra ausente é trocada pela lexema mais parecida acima do limiar. `racao golen` vira
`racao & golden` e é resolvido pelo full-text normal.

O ganho que decidiu a escolha: o ranking continua sendo `ts_rank` **puro**. Nenhuma escala
é somada a outra, e o trigrama deixa de ser um plano B para virar um corretor ortográfico —
que era o objetivo didático declarado na N12.

O preço, assumido: a lista de lexemas é **derivada** e fica defasada entre refreshes (Z14).
Um produto cadastrado agora é encontrado imediatamente por busca exata, sem acento e por
radical; o que espera o refresh é só a correção de erro de digitação nas palavras inéditas
dele.

### Z4 — o SQL cru só ranqueia; a visibilidade nunca sai do TypeScript

Este documento dizia que o repository "devolve dado, não linha de banco crua". A 9.9 aperta
mais: a query crua devolve **só `(id, rank)`**, e quem decide o que existe continua sendo o
`buildProductWhere` do `product.repository.ts`, aplicado depois pelo Prisma sobre esses ids.

A alternativa — uma query crua completa, com visibilidade, filtros, `ORDER BY` e `COUNT` em
SQL — daria `total` exato e uma ida ao banco em vez de duas. Foi recusada porque criaria uma
**segunda** definição de "produto visível", em outra linguagem, que precisaria concordar com
a primeira para sempre. É o vazamento que a Y8 fechou na 9.8 (produto invisível some da
lista e continua acessível pela URL), reaberto por outra porta.

Consequência aceita: os ids ranqueados são limitados a **500**, então o `total` de uma busca
é capado (Z9). Imprecisão em `total` de busca é barata; rascunho vazando não é.

### Z17 — o dicionário só conhece o catálogo público

Consequência direta de expor a correção na resposta (`meta.search.applied`, Z15): se o
dicionário fosse construído sobre **todos** os produtos, um visitante anônimo poderia sondar
o catálogo oculto palavra a palavra. `?q=colerinha` devolveria `applied: "coleirinha"` e
confirmaria que essa palavra existe — mesmo com a lista de resultados vazia, porque o
`buildProductWhere` faz o seu trabalho e o campo novo não sabia disso.

Por isso a view materializada é recortada pelo que a vitrine já mostra: produtos `ACTIVE`
não deletados e suas marcas. Custo aceito: quem tem `read:product:internal` também não ganha
correção de typo em palavra que só existe em rascunho.

### Z1 — o corpus para de onde a coluna gerada alcança

Coluna gerada só enxerga a **própria linha**, e isso — não uma preferência — define o corpus.
Produto (`name` peso A, `description` peso C) e marca (`name`, em coluna gerada própria na
tabela `brands`) cabem em duas colunas geradas e um join, sem trigger nenhum e sem chance de
ficarem stale. Tag não cabe: é N:N, exigiria denormalização mantida por quatro triggers, e
renomear uma marca passaria a obrigar reindexação dos produtos dela. Ficou de fora porque
`?tag=` já é filtro de primeira classe desde a 9.8 — pagar staleness para duplicar um filtro
que já existe é o pior negócio disponível.

**Efeito colateral que encolhe o plano original:** com a Z5, o trigrama passa a operar sobre
o **dicionário de lexemas**, nunca sobre o texto do produto. Some a necessidade de manter
uma coluna de texto sem acento por tabela e o índice GIN trigrama sobre ela — o único índice
trigrama do projeto fica no dicionário. A armadilha 3 acima continua valendo para os índices
GIN de `tsvector`.

## Alternativas consideradas

- **`ILIKE` + `unaccent`:** suficiente para o volume real do projeto, mas sem
  tolerância a erro de digitação nem ranking — não atende o objetivo didático
  declarado. Preterido por escolha explícita do usuário.
- **Meilisearch/Typesense:** ver acima. Preterido por custo de infra e
  sincronização, não por ser pior tecnicamente.
- **Busca client-side (frontend filtra tudo):** inviável no volume de um
  catálogo real e o projeto é backend-only.

## Quando revisitar

- Se o volume do catálogo crescer a ponto de o Postgres não performar mesmo
  com os índices certos: migrar para Meilisearch/Typesense, com o pipeline de
  sincronização como custo assumido naquele momento.
- Se a estratégia de consulta (full-text-depois-trigrama vs. pontuação
  combinada) escolhida na 9.9 se mostrar difícil de calibrar em produção:
  revisar aqui com dado real de busca, não hipotético.

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

**Estratégia de consulta:** full-text primeiro, com ranking (`ts_rank`); se o
resultado vier vazio ou muito pobre, cair para similaridade por trigrama acima
de um limiar. Alternativa considerada: pontuação combinada numa query só
(`ts_rank` + `similarity` com pesos) — mais elegante, mais difícil de
calibrar; a escolha entre as duas fica para a implementação da sub-fase 9.9.

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
   por trigger. As duas têm ressalvas; a escolha feita na implementação deve
   ser registrada como adendo aqui.
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
   query, não por sessão.

### O que buscar

Nome do produto, nome da marca, descrição — com pesos diferentes
(`setweight`: nome pesa mais que descrição). Tags são candidatas naturais
também.

### Testes

A sub-fase de maior risco de teste frouxo do projeto. O teste tem que afirmar
comportamento observável — "buscar `racao golden` encontra o produto 'Ração
Golden Adulto'", "buscar `golen` (com typo) encontra", "buscar `xyzabc` não
encontra", "resultado mais relevante vem primeiro" — e não a forma da query.

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

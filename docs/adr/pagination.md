# Paginação: duas estratégias, um envelope

> Decisão de contrato de API registrada no planejamento da Fase 7 (sub-fase 7.7).
> Introduz um **breaking change** em todas as listagens. Não altera regra de
> negócio; altera o shape de resposta.

## O problema

`GET /users` devolve um array cru, sem `skip`/`take`
(`src/modules/user/user.repository.ts`, `findAllUsers`). Com dezenas de usuários
isso é irrelevante; com o volume que a Fase 9 (pets, produtos, serviços,
histórico) traz, vira uma resposta que cresce sem teto — e o dia em que paginar
virar obrigatório, o contrato quebra de qualquer forma.

O problema seguinte é o audit log (7.6/7.8): uma tabela append-only ordenada por
tempo, com escrita concorrente e leitura por página. Offset ali **pula e repete
registros** — se uma linha nova entra entre o request da página 1 e o da página 2,
todo o resto desliza.

## Decisão ✅

### Duas estratégias, cada recurso escolhe a sua

`src/lib/pagination.ts` oferece as duas. Não há estratégia única porque as duas
naturezas de lista são genuinamente diferentes, e forçar um contrato só usaria a
ferramenta errada de um dos lados.

**Offset** — padrão para listas de CRUD (`/users` e o que a Fase 9 trouxer).
Query `?page=&limit=`, meta `{ page, limit, total }`. Ganha o `total` e o salto
para uma página arbitrária, que é o que uma tabela de administração precisa.
Aceita o deslize sob escrita concorrente, que nesse contexto é tolerável.

**Cursor / keyset** — para listas append-only ordenadas por tempo
(`/audit-logs`). Query `?cursor=&limit=`, meta `{ nextCursor, hasMore }`. Não
tem `total` (contar uma tabela grande a cada request é caro) nem salto para
página arbitrária — em troca, nunca pula nem repete registro.

### O tiebreaker por `id` é obrigatório

A chave do cursor é **composta**: `(campo_de_ordenação, id)`. Ordenar só por
`createdAt` parece funcionar até dois registros compartilharem o timestamp — e
num audit log, duas ações na mesma transação compartilham. Quando isso acontece
com cursor de chave única, a borda da página ou pula um registro ou o repete,
dependendo do lado. O `id` como desempate torna a ordem total e o corte exato.

É o tipo de bug que não aparece em teste com dados gerados um a um, então o
projeto carrega um teste de regressão dedicado: **cursor com timestamps
duplicados não pula nem repete**.

### Cursor opaco

O cursor vai e volta como base64 do par `(campo, id)`. Opaco de propósito: o
cliente não deve construir nem interpretar cursor, senão o formato interno vira
contrato público e não pode mais mudar. Cursor malformado ou corrompido → **422**
(é entrada inválida do cliente, não erro do servidor).

### Envelope `{ data, meta }` em todas as listagens

Toda listagem passa a devolver `{ data, meta }`, **inclusive as que não paginam**:

| Endpoint | Envelope | Estratégia |
|---|---|---|
| `GET /users` | ✅ | offset + filtros `status`, `banned`, `role` |
| `GET /audit-logs` | ✅ | cursor |
| `GET /logs/recent` | ✅ | nenhuma (limitado por construção; `meta` declara a limitação do ring buffer) |
| `GET /roles` | ✅ | nenhuma |
| `GET /features` | ✅ | nenhuma |
| `GET /auth/sessions` | ✅ | nenhuma |
| `GET /users/:userId/roles` | ✅ | nenhuma |
| `GET /users/:userId/features` | ✅ | nenhuma |

**Exceção:** `GET /users/:userId/permissions` continua devolvendo `string[]` cru.
Não é uma coleção de recursos — é o conjunto de capacidades efetivas computado em
runtime, sem identidade nem ordenação própria. Envelopá-lo seria cerimônia sem
conteúdo (`meta` vazio para sempre).

O custo é assumido de uma vez: um breaking change em ~7 endpoints, com presenters,
OpenAPI, coleção Bruno e testes atualizados na mesma feat-branch. A alternativa —
envelopar só quem pagina hoje — economizaria trabalho agora e cobraria o mesmo
breaking change em parcelas, cada vez que uma lista crescesse o bastante para
precisar de página. Um contrato uniforme também é o que permite ao cliente
escrever um consumidor de lista genérico.

### Limites

`limit` default **20**, máximo **100**, constantes em `src/lib/pagination.ts`
(não são env var: fazem parte do contrato documentado no OpenAPI, não da
configuração de ambiente). `limit` acima do teto → **422**, com o `errors` por
campo do idioma do projeto — não um clamp silencioso, que faria o cliente
acreditar que recebeu tudo.

Página vazia → `data: []` com **200**. Lista vazia não é 404: o recurso coleção
existe, só não tem elementos.

## Alternativas consideradas

- **Uma estratégia só (offset em tudo):** simples, e errada para o audit log —
  pular/repetir registro numa trilha de auditoria destrói justamente a
  propriedade que ela existe para garantir. Preterido.
- **Uma estratégia só (cursor em tudo):** custaria o `total` e o salto para
  página arbitrária em `/users`, que é uma tela de administração. Preterido.
- **Paginação por header** (`X-Total-Count`, `Link`): não quebraria o contrato
  atual, mas foge do idioma do projeto (tudo em JSON no corpo), documenta mal no
  Scalar, e o cursor não cabe bem em header. Preterido.
- **Envelope só onde pagina:** ver acima — troca um breaking change grande por
  vários pequenos. Preterido.
- **Ordenação configurável (`?sort=`):** fora de escopo, no `docs/reference/backlog.md`. É
  trivial em offset e complexo em cursor (a chave teria que codificar o campo de
  ordenação).

## Quando revisitar

- Quando a **Fase 9** trouxer o primeiro recurso de domínio: confirmar que o
  helper serve sem fork (é o motivo de ele ser extraído antes dos endpoints).
- Se alguma lista "sem paginação" crescer (ex. `/auth/sessions` com o teto de
  sessões da 7.13 elevado): ela já tem o envelope, então ganhar `meta` de offset é
  aditivo, não breaking. Era o objetivo.
- Se `?sort=` sair do backlog: implementar só para offset e documentar a
  limitação no cursor.

**O que a Fase 7 mostrou até aqui (7.19):** nenhum recurso novo usou o helper
desde a 7.7/7.8 — o único consumidor de cursor continua sendo `GET /audit-logs`
e o único de offset é `GET /users`. A hipótese de "servir sem fork" só será
testada de fato quando a Fase 9 chegar; até lá, nada a revisar aqui.

## Adendo (Fase 9.2) — ordenação configurável

`?sort=` saiu do `docs/reference/backlog.md` na Fase 9: as listagens novas de domínio
(pets, produtos) tornam ordenação por campo (preço, nome, data de criação)
relevante o suficiente para não ficar mais pendente.

**Sintaxe:** `?sort=<campo>&order=asc|desc`, decidido no planejamento da fase.

**Allowlist por recurso.** O campo nunca vai cru para o `orderBy` do Prisma —
cada recurso declara os campos que aceita ordenar (para `Product`: `price`,
`name`, `createdAt`, e possivelmente relevância quando houver busca textual
`q`, ver `docs/adr/text-search.md`). Campo fora da allowlist → **422**, mesmo
idioma de erro por campo do resto do projeto. Um `orderBy` construído
diretamente do query param seria uma superfície de erro (nome de coluna
inválido vira 500) e, dependendo da implementação, de injeção.

**Tiebreaker por `id` continua obrigatório**, agora também no `?sort=`
customizado — a mesma lição da 7.7: dois registros com o mesmo valor no campo
de ordenação, em páginas diferentes, se repetem ou somem sem um desempate
determinístico.

**Entra só no offset.** No cursor, a chave do cursor teria que codificar o
próprio campo de ordenação (hoje é sempre `(campo_fixo_do_recurso, id)`) — a
limitação já registrada permanece: cursor não ganha `?sort=` nesta fase.

**Caso especial — ordenar por preço com N variantes:** quando um recurso (como
`Product`) tem preço na variante, não no próprio registro, ordenar por "preço"
exige uma decisão de contrato adicional (menor preço entre variantes ativas?
preço da variante default?) — tratada como pendência de negócio da sub-fase
9.8, não uma extensão deste ADR.


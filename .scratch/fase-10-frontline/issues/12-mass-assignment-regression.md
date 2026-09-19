# 12: Regressão explícita de mass assignment

**What to build:** garantia de que nenhum schema de update aceita, vindo do corpo da requisição,
um campo que só o sistema deveria escrever — estado da conta, vínculo de papel, marca de
banimento, marca de senha forçada. Se o comportamento padrão do validador já rejeita chaves
desconhecidas, este item **é** o teste: vale ter, porque é o tipo de proteção que se perde em
silêncio num refactor e que ninguém percebe até virar incidente.

**Blocked by:** None (can start immediately).

**Status:** fechada em 2026-09-14

- [x] Levantamento de todos os schemas de update e do que cada um aceita.
- [x] Teste por schema afirmando que a chave privilegiada enviada no corpo é rejeitada ou
      descartada — e que o campo no banco **não** mudou.
- [x] Se algum schema estiver de fato permissivo, corrigir; se todos já estiverem cobertos, o
      resultado é só a suíte nova, e isso é registrado como resultado legítimo, não como item
      vazio.

---

## Fecho (2026-09-14)

**Levantamento.** Todo endpoint de escrita que recebe corpo, agrupado pelo que o Zod faz com a
chave desconhecida:

| Endpoint | Modo | Campos que só o sistema escreve |
|---|---|---|
| `PATCH /users/:id` | `.strict()` + `z.never` (cpf, email, password, roleNames) | `status`, `bannedAt/By`, `banReason`, `mustChangePassword`, `passwordHash`, `deletedAt` |
| `PATCH /pets/:petId` | `.strict()` + `z.never` (customerId, deceasedAt, photoPath) | `deletedAt` |
| `PATCH /products/:id` | `.strict()` | `deletedAt`, `createdAt`, `id` |
| `PATCH /variants/:id` | `.strict()` + `isDefault: z.literal(true)` | `productId`, `deletedAt` |
| `PATCH /brands/:id` | `.strict()` + `z.never` (logoPath) | `deletedAt` |
| `PATCH /categories/:id` | `.strict()` | `deletedAt`, `id` |
| `PATCH /tags/:id` | `.strict()` | `id`, `createdAt` |
| `PUT /users/:u/roles/:r/features/:f` | strip | `deletedAt`, `userRoleId` |
| `POST /auth/signup` | strip | `status`, `roleNames`, `mustChangePassword`, `bannedAt`, `deletedAt` |
| `POST /users` | strip | `status`, `mustChangePassword`, `bannedAt/By`, `deletedAt` |
| `POST /users/:id/ban` | strip | `bannedAt`, `bannedBy` (o sistema carimba relógio e ator) |
| `POST /users/:id/reactivate` | strip | `status`, `deletedAt` (o pedido só emite token; quem reativa é o dono) |
| `POST /auth/change-password` | strip | `mustChangePassword`, `passwordHash`, `status`, `deletedAt` |
| `POST /auth/change-email` | strip | `email` (só `pendingEmail` muda, via `newEmail`) |
| `POST /users/:userId/customer` | strip | `userId` (vem do path), `deletedAt` |

`PATCH /products/:id/images/order` também é `.strict()`, mas o corpo é só a lista ordenada de ids
— não há coluna do sistema com que uma chave do corpo pudesse colidir, então não ganhou caso.
Os fluxos por token (`verify-email`, `reset-password`, `confirm-*`) recebem só o token e a senha
nova; o alvo é resolvido pelo token, não pelo corpo.

**Nenhum schema estava permissivo.** Todo update é `.strict()` (chave desconhecida → 422 em
`errors.body`, requisição inteira recusada); create, ações de estado e o `PUT` do override
descartam a chave, e é o corpo parseado — não `req.body` — que chega ao service. O resultado da
issue é **só a suíte nova**, como o item previa.

**Testes.** `tests/integration/v1/mass-assignment.test.ts`, um `describe` por endpoint, 15 casos.
Nos `.strict()`: um campo legítimo junto das chaves privilegiadas; a chave é recusada **por nome**
(helper `expectKeysRefused`: aceita tanto a chave própria de um `z.never` quanto a menção em
`Unrecognized keys: "…"` — o contrato é *qual* chave, não *onde* o schema a proibiu) **e** a linha
é idêntica à de antes (`toEqual(before)`, inclusive o campo legítimo). Nos strip: resposta de
sucesso e coluna com o valor **do sistema**, nunca o do corpo — `PENDING` + role `customer` no
signup, relógio e ator no ban, `deletedAt` ainda preenchido depois do pedido de reativação,
`pendingEmail` e não `email` na troca de endereço, override na tripla do path. Toda probe manda um
valor distinto do default (`FORGED_AT`, `mustChangePassword: true`), senão a asserção seria vácua.

O escopo literal da issue era "schemas de update"; os `POST` entraram porque alteram estado
existente (ban, reactivate, change-*) ou porque criam a conta cujo estado a issue nomeia (signup,
que é a única escrita sem autenticação, e `POST /users`). A regra registrada é para **todo**
schema de escrita, e o arquivo a honra.

**Vermelho verificado** trocando `.strict()` por `.strip()` em `updateUserSchema` e
`updateVariantSchema`: os dois casos falharam, cada um nomeando a chave que passou a entrar
(`status`, `productId`); os demais seguiram verdes. Mutação revertida antes do commit.

**Revisão** (duas trilhas, padrões + spec) apontou: probes iguais ao default no signup (vácuas),
o levantamento parado nos `PATCH`/`PUT`, `isDefault: false` no caso da variante (regra de
negócio já coberta em `product.variant.test.ts`, não campo de sistema), `findMany` sem `where`
acoplado ao `clearDatabase`, e a regra nova enterrada em `docs/context/` onde quem cria schema
não lê. Tudo corrigido no commit de revisão; a 6ª cópia de `loginAsCatalogManager` foi para o
`docs/reference/backlog.md` em vez de espalhar este diff por cinco arquivos alheios.

Decisão registrada em `apps/api/docs/adr/README.md#segurança` ("Mass assignment: schema de update é `.strict()`,
e a proteção tem teste próprio (10.12)") + linha no índice; ponteiro acionável em `CLAUDE.md`
(Convenções de código); item do backlog marcado resolvido.

Suíte completa, `typecheck`, `lint` e `docs:check` verdes.

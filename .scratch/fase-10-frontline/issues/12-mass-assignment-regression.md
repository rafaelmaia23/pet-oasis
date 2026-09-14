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

**Levantamento.** Nove schemas recebem corpo em escrita que altera estado existente ou cria conta:

| Endpoint | Modo | Campos que só o sistema escreve |
|---|---|---|
| `PATCH /users/:id` | `.strict()` + `z.never` (cpf, email, password, roleNames) | `status`, `bannedAt/By`, `banReason`, `mustChangePassword`, `passwordHash`, `deletedAt` |
| `PATCH /pets/:petId` | `.strict()` + `z.never` (customerId, deceasedAt, photoPath) | `deletedAt` |
| `PATCH /products/:id` | `.strict()` | `deletedAt`, `createdAt`, `id` |
| `PATCH /variants/:id` | `.strict()` + `isDefault: z.literal(true)` | `productId`, `deletedAt` |
| `PATCH /brands/:id` | `.strict()` + `z.never` (logoPath) | `deletedAt` |
| `PATCH /categories/:id` | `.strict()` | `deletedAt`, `id` |
| `PATCH /tags/:id` | `.strict()` | `id`, `createdAt` |
| `PUT /users/:u/roles/:r/features/:f` | strip (padrão do Zod) | `deletedAt`, `userRoleId` |
| `POST /auth/signup` | strip (padrão do Zod) | `status`, `roleNames` |

`PATCH /products/:id/images/order` também é `.strict()`, mas o corpo é só a lista ordenada de ids
— não há coluna do sistema com que uma chave do corpo pudesse colidir, então não ganhou caso.

**Nenhum schema estava permissivo.** Todo update é `.strict()` (chave desconhecida → 422 em
`errors.body`, requisição inteira recusada); create e o `PUT` do override descartam a chave, e é o
corpo parseado — não `req.body` — que chega ao service. O resultado da issue é **só a suíte
nova**, como o item previa.

**Testes.** `tests/integration/v1/mass-assignment.test.ts`, um `describe` por endpoint. Cada caso
manda um campo legítimo junto das chaves privilegiadas e prova as duas metades: a chave é recusada
**por nome** (helper `expectKeysRefused`: aceita tanto a chave própria de um `z.never` quanto a
menção em `Unrecognized keys: "…"` do `.strict()` — o contrato é *qual* chave, não *onde* o schema
a proibiu) **e** a linha no banco é idêntica à de antes (`toEqual(before)`, inclusive o campo
legítimo, porque a recusa é da requisição inteira). Nos dois schemas strip a prova é inversa:
201/200 e a linha escrita com o estado do sistema (`PENDING` + role `customer`; override na tripla
do path, `deletedAt: null`), ignorando o que veio no corpo.

O `signup` entrou de propósito embora seja schema de *create*, não de update: é a única escrita
sem autenticação, e "estado da conta" e "vínculo de papel" — os dois primeiros campos que a issue
nomeia — seriam explorados ali antes de qualquer PATCH.

**Vermelho verificado** trocando `.strict()` por `.strip()` em `updateUserSchema` e
`updateVariantSchema`: os dois casos falharam, cada um nomeando a chave que passou a entrar
(`status`, `productId`); os outros sete seguiram verdes. Mutação revertida antes do commit.

Decisão registrada em `docs/context/security.md` ("Mass assignment: schema de update é `.strict()`,
e a proteção tem teste próprio (10.12)") + linha no índice — inclusive a regra de que schema de
escrita novo entra no arquivo de regressão no mesmo commit em que nasce.

Suíte completa (**1239**), `typecheck`, `lint` e `docs:check` verdes.

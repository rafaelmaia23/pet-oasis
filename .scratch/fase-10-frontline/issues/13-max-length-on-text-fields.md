# 13: Comprimento máximo em todo campo de texto

**What to build:** um campo de texto para de aceitar 99KB. O limite total de corpo protege o
agregado, mas nada impede quase todo ele dentro de um único campo de nome — o que vira lixo no
banco, índice inchado e, agora que existe log estruturado, linha de log gigante.

**Blocked by:** None. Última da trilha de aplicação **de propósito**: é varredura larga sobre os
schemas, e fazê-la antes conflitaria com qualquer outra edição de schema da fase.

**Status:** fechada em 2026-09-14

- [x] Varredura em todos os schemas, acrescentando limite coerente com a coluna correspondente
      do modelo de dados. Onde a coluna não tem limite declarado, o limite é escolhido e o
      motivo é registrado.
- [x] A mudança é **aditiva**: acrescentar limite não quebra chamador nenhum, então pousa verde
      de uma vez — não precisa de expand–contract.
- [x] Teste por schema tocado, afirmando que o campo acima do limite é recusado com o erro de
      validação **por campo** — não um teste-monolito.
- [x] Documentação de rotas e especificação gerada refletem os limites, que agora são contrato.

---

## Fecho (2026-09-14)

**Varredura.** Nenhuma coluna do Prisma declara tamanho (`String`, nunca `@db.VarChar`), então
"coerente com a coluna" virou "coerente com o que o campo representa", com o motivo em comentário
ao lado de cada constante. Catálogo (`brand`, `category`, `tag`, `product`, `variant`, `image`),
pet e busca já tinham `.max()` em todo campo de texto desde a Fase 9 — nada a fazer. O que
faltava, todo de identidade e sessão:

| Campo | Onde | Teto | Por quê |
|---|---|---|---|
| `email`, `newEmail` | signup, `POST /users`, login, resend, forgot-password, change-email | 254 | RFC 5321: caminho de até 256 octetos com os `<>` |
| `password`, `currentPassword` (conferida) | login, change-password, change-email | 100 | o teto do `passwordSchema` — senha maior nunca foi gravada, então nunca bate |
| `token` | verify-email, reset-password, confirm-email-change, confirm-account-reactivation | 64 | hex dos 32 bytes que `generateOpaqueToken` emite; constante ao lado do gerador |
| `cpf` (texto cru) | signup, `POST /users` | 14 | a máscara `000.000.000-00` |
| `phone` (texto cru) | signup, perfil de cliente, reativação | 20 | a máscara `+55 (11) 9 8765-4321` |
| `cursor` | toda listagem por cursor (`GET /audit-logs`) | 128 | folga sobre os 100 do base64url de `{ c, i }` |
| `targetId` | filtro de `GET /audit-logs` | 36 | todo alvo gravado é uuid |

CPF e telefone ganharam o `.max()` **antes** do `transform`, de propósito: a normalização tira os
separadores, então onze dígitos afogados em 99KB de hífen passariam pelo `length(11)` de depois.
O teste manda exatamente isso.

**Refactor que veio junto.** O telefone estava copiado três vezes e o email cinco; viraram
`emailSchema`, `cpfSchema`, `phoneSchema` em `user.schema.ts` e `presentedPasswordSchema`/
`tokenSchema` em `auth.schema.ts` — uma peça por conceito, um lugar para o teto.

**Testes.** Um caso por schema tocado, no arquivo do módulo (`auth`, `user`, `user.profile`,
`account-reactivation`, `audit-log`), com o valor acima do teto e `expectValidationError`
nomeando o campo — 18 casos. Mais um em `openapi.test.ts` afirmando que o `maxLength` sai na spec
para uma amostra de cada classe (corpo, texto cru com máscara, query): o teto é contrato, e um
teto removido num refactor fica vermelho na spec.

**Docs.** `apps/api/docs/reference/endpoints.md` (parágrafo "Comprimento máximo"), decisão em
`apps/api/docs/adr/0128-todo-campo-texto-tem-teto-teto-contrato.md` com linha no
índice, regra de "campo de texto novo nasce com `.max()`" em `CLAUDE.md`, e o item do backlog
riscado.

**Fora, de propósito, e já no backlog:** `User-Agent`/`X-Forwarded-For` vão para `Session` e
`AuditLog` sem teto próprio (são header, não campo de schema); e os inteiros da variante
(`stockQuantity`, `weightGrams`, `volumeMl`) não são texto, mas um valor acima de 2³¹−1 estoura
o `Int` do Postgres antes de virar 422.

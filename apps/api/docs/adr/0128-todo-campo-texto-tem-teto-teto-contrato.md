# Todo campo de texto tem teto, e o teto é contrato (10.13)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Segurança** › *Hardening HTTP*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

O limite total de corpo (`JSON_BODY_LIMIT`, 100kb) protege o agregado, mas nada impedia quase
todo ele dentro de um único campo: 99KB num `email` de login passavam pelo `z.email()` (o regex
não tem tamanho), iam ao banco, inchavam o índice único e, agora que existe log estruturado,
viravam uma linha de log de 99KB. A defesa é a mesma do mass assignment — no **schema**, não no
service: todo campo de texto tem `.max()`, e acima dele a resposta é 422 nomeando o campo, o
mesmo shape de toda validação sintática.

Nenhuma coluna do Prisma declara tamanho (`String`, nunca `@db.VarChar`), então "coerente com a
coluna" virou "coerente com o que o campo representa", e o motivo de cada teto está gravado ao
lado da constante. Os do catálogo e do pet já nasceram com teto (9.4–9.9); o que faltava era
identidade e sessão, e cada um tem um número que se **deriva**, não que se escolhe: email 254 é o
caminho máximo do RFC 5321; senha 100 é o teto do `passwordSchema` reaplicado onde ela é só
conferida — senha maior nunca foi gravada, então nunca vai bater, e recusar antes do bcrypt não
muda o resultado, só o custo; token 64 é o hex dos 32 bytes que `generateOpaqueToken` emite, e a
constante mora ao lado do gerador para que mudar um mude o outro; `targetId` 36 é o uuid que todo
audit grava; `cursor` 128 é folga sobre os 100 do base64url de `{ c, i }`. CPF 14 e telefone 20
são as **máscaras** (`000.000.000-00`, `+55 (11) 9 8765-4321`), e o `.max()` fica **antes** do
`transform` que tira os separadores — de propósito: o teto é sobre o que o cliente digita, senão
onze dígitos afogados em 99KB de hífen passariam pelo `length(11)` de depois.

As peças ficaram **uma por conceito** (`emailSchema`, `cpfSchema`, `phoneSchema` em
`user.schema.ts`; o teto de senha conferida e o de token em `auth.schema.ts`): o telefone estava
copiado três vezes (signup, perfil de cliente, reativação), e três cópias com teto seriam três
lugares para o teto divergir. O teto sai no `/openapi.json` como `maxLength` de graça, porque a
spec é gerada dos schemas — e é contrato: `openapi.test.ts` afirma uma amostra de cada classe
(corpo, texto cru com máscara, query), para que um teto removido num refactor fique vermelho na
spec, e não só num teste de módulo. Cada schema tocado tem o próprio teste, no arquivo do módulo,
com o valor **acima** do teto: nada de teste-monólito varrendo schemas — a varredura foi o
trabalho, o teste é a regressão. Campo de texto novo nasce com `.max()`, e a regra vive em
`CLAUDE.md`, ao lado da do `.strict()`.

O que **não** entrou, de propósito: `User-Agent` e `X-Forwarded-For` vão para `Session` e
`AuditLog` sem teto próprio — são header, não campo de schema, e o único teto hoje é o do Node
(`--max-http-header-size`, 16KB). E os inteiros sem `.max()` (`stockQuantity`, `weightGrams`,
`volumeMl` da variante) não são texto, mas um valor acima de 2³¹ estoura o `Int` do Postgres
antes de virar 422. Os dois estão no backlog.

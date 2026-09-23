# Mass assignment: schema de update é `.strict()`, e a proteção tem teste próprio (10.12)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Segurança** › *Hardening HTTP*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

O que só o sistema escreve — status do `User`, marca de banimento, `mustChangePassword`,
`passwordHash`, vínculo de papel, `deletedAt`, dono de um recurso — nunca pode chegar pelo corpo
da requisição. A defesa está no schema, não no service: todo schema de **update** é `.strict()`
(chave desconhecida → 422 nomeando a chave em `errors.body`, e a requisição inteira é recusada,
inclusive o campo legítimo que veio junto), e o que o endpoint recusa de propósito tem `z.never`
com mensagem própria (`cpf`, `email`, `roleNames` no user; `customerId`, `deceasedAt` no pet;
`logoPath` na marca). Os schemas de **create** e o `PUT` do override ficam no modo padrão do Zod,
que *descarta* a chave desconhecida — e é o corpo parseado, não `req.body`, que segue para o
service, então a chave descartada não existe mais quando o Prisma monta o `data`.

O levantamento da Fase 10 não achou schema permissivo. O que faltava era o teste: essa é a
classe de proteção que se perde em silêncio num refactor (um `.strict()` que vira `.strip()`, um
`.extend()` na ordem errada, um `data: req.body` num controller novo) e que ninguém nota até virar
incidente. `tests/integration/v1/mass-assignment.test.ts` cobre cada endpoint de escrita que
recebe corpo — os sete `PATCH`, o `PUT` do override, e os `POST` que criam usuário ou perfil ou
alteram estado (`signup`, `users`, `ban`, `reactivate`, `change-password`, `change-email`,
perfil de cliente) — com um caso que prova as duas metades. Nos `.strict()`, a chave privilegiada
é recusada **por nome** e a linha é idêntica à de antes (a recusa é da requisição inteira, o campo
legítimo que veio junto também não entra). Nos strip, a resposta é de sucesso e a coluna carrega o
valor **do sistema** — `PENDING` no signup, o relógio e o ator no ban, `pendingEmail` e não
`email` na troca de endereço —, nunca o do corpo; por isso cada probe manda um valor distinto do
default, senão a asserção seria vácua. O vermelho foi verificado trocando `.strict()` por
`.strip()` em dois schemas: os dois casos falharam apontando a chave que passou a entrar. Schema
de escrita novo entra nesse arquivo no mesmo commit em que nasce — regra apontada em `CLAUDE.md`,
que é onde quem cria schema lê.

# Criado via `userRepository`, não via `user.service`

> Decisão migrada em 2026-09-18 do contexto temático da API (**Infraestrutura** › *Dataset fake*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

`user.service.createCustomer`/`createEmployee` dispara `issueEmailVerification` (email real, via
SMTP). Rodando o seed a cada boot do container, isso bombardearia o relay de emails de verificação
inúteis a cada restart. O repository (mesma técnica de `tests/factories/user.factory.ts`) cria sem o
efeito colateral, e o `status` é forçado por `prisma.user.update` depois — idêntico ao que os testes
já faziam.

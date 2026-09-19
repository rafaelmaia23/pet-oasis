# `demo-reset` esquecia a tabela `previousEmail`

> Decisão migrada em 2026-09-18 do contexto temático da API (**Infraestrutura** › *Seeds e ambiente demo*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Ele truncava 8 tabelas na mesma ordem FK-safe de `clearDatabase()`, mas a `previousEmail` nasceu na
7.15, depois de a 7.14 ter sido escrita, e ninguém voltou para atualizar a lista. Na época, um email
trocado via `change-email` no demo ficaria **preso para sempre** mesmo após o reset diário, porque a
coluna era unique global. Esse efeito deixou de existir na 8.6 (o `@unique` saiu e `PreviousEmail`
parou de bloquear — ver
[identity-and-sessions.md](0083-unique-previousemail-email-saiu-junto.md)),
mas o fix continua certo pelo motivo geral: a tabela é transacional e tem de voltar ao estado
inicial.

# Só a criação de usuário emite verificação — os POSTs de perfil não

> Decisão migrada em 2026-09-18 do contexto temático da API (**Identidade e sessões** › *Verificação de email*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

A emissão mora em `user.service.createCustomer`/`createEmployee`, que cobre os dois caminhos que
criam usuário novo (signup e `POST /users`). `POST /users/:id/customer|employee` **não** emite:
adiciona um 2º perfil a um usuário que já existe (já tem `status` e já recebeu o email) —
re-emitir ali geraria ruído sem provar nada de novo. Verificação é sobre a identidade do email, que
não muda ao ganhar um perfil.

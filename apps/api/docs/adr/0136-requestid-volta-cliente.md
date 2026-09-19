# O `requestId` volta ao cliente

> Decisão migrada em 2026-09-18 do contexto temático da API (**Observabilidade** › *As três categorias*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

No header `x-request-id` e no corpo de toda resposta de erro. Sem isso, a correlação existe mas é
inalcançável a partir do relato de um usuário ("deu erro ontem"); com ela, o id citado recupera
access, application e audit log daquele request. O id não é segredo, e o corpo de erro continua
sem stack.

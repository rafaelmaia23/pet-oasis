# O `phone` é pedido na confirmação, não no pedido (K23)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Ciclo de vida** › *Conta — deleção e reativação*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Ele só é necessário no ramo em que o perfil de cliente **nasce do zero** (usuário que só tinha
funcionário), e nesse ramo falta um telefone obrigatório que ninguém tem além do próprio dono.
Pedi-lo na emissão do token exigiria uma coluna nova para carregá-lo até a confirmação; na
confirmação não custa nada, porque quem confirma é o dono. Ausente quando o ramo exige → 422 em
`errors.phone`. No ramo de restauração é opcional e **atualiza** o perfil restaurado — hoje é o
único caminho que grava `Customer.phone` depois da criação (`PATCH /users/:id` só aceita `name`).

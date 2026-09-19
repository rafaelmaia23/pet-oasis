# O signup que dispara reativação responde 202 (K18)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Ciclo de vida** › *Conta — deleção e reativação*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Primeiro 202 do projeto, e ele diz exatamente o que houve: pedido aceito, **nenhum recurso
criado**, efeito fora da request (o email). 201 mentiria sobre criação e 200 seria menos
expressivo num POST sem corpo útil. O anti-enumeração continua: cpf que não bate, usuário banido
(K24) e usuário ativo (D12) devolvem o mesmo 409 genérico, indistinguíveis entre si.

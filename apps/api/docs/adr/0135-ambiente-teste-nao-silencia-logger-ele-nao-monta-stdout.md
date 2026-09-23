# O ambiente de teste não silencia o logger — ele não monta o stdout

> Decisão migrada em 2026-09-18 do contexto temático da API (**Observabilidade** › *As três categorias*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

`LOG_LEVEL=silent` deixaria a suíte limpa, mas impediria testar qualquer linha, e a política
depende de teste para valer. Com os destinos escolhidos por ambiente, o test escreve **só no ring
buffer**: saída limpa e linhas assertáveis, sem mock, pelo mesmo mecanismo que `GET /logs/recent`
expõe.

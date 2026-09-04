# Não escrevemos teste de markup

A API deste mesmo autor segue TDD absoluto — nada entra sem teste que a guie, e a suíte
passa de mil casos. Aqui a regra é deliberadamente outra: **teste dirige as costuras que têm
regra** — sessão e rotação de refresh, mapeamento do 422 para campo de formulário, conversão
de centavos, `can()`, `apiFetch` — e **Playwright cobre os fluxos críticos** ponta a ponta
contra a API real em Docker. Nenhum teste afirma sobre estrutura de DOM, hierarquia de
componente ou classe de CSS.

## Consequences

O motivo é que markup é, neste projeto, a coisa que mais muda — e mudar é o comportamento
desejado, não um risco a conter: iteração visual barata foi requisito explícito. Teste de
markup transforma cada ajuste visual em duas edições e não pega nenhum dos defeitos que
custam caro aqui, que são todos de costura: um refresh concorrente que desloga o usuário de
todos os dispositivos, um `can()` que ignora o wildcard e esconde o back-office do admin,
um valor em centavos formatado como reais.

Isto está registrado porque, sem registro, alguém lendo os dois repos lado a lado vê a
disciplina da API e conclui que aqui houve relaxamento. Não houve: é a mesma pergunta — *o
que este teste está protegendo?* — respondida para um domínio com outra forma de risco.

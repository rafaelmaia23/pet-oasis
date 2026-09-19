# A documentação de domínio segue a skill `domain-modeling` sem adaptação

> Decisão de sistema, tomada em 2026-09-18 na revisão da issue 02 da Fase 11 e executada na
> issue 07. Vale para todo app do monorepo. Contexto de execução em
> `.scratch/monorepo/issues/07-root-docs-skeleton.md`.

A API guardava o *porquê* das decisões em onze arquivos temáticos (`docs/context/`, mais de 25
mil tokens, indexados por um `context.md`) e proibia um `CONTEXT.md` na raiz — a convenção era
anterior à skill e mais granular. O web, importado na mesma fase, já seguia a skill: `CONTEXT.md`
como glossário e ADRs numerados. Com dois apps e um pacote de contratos, duas convenções de
documentação de domínio não escalam, e a skill é a que as ferramentas (`grill-with-docs`,
`to-spec`, `domain-modeling`) leem sem tradução.

**Decidimos** seguir a skill sem adaptação: `CONTEXT-MAP.md` na raiz lista um contexto por app
e o caminho do `CONTEXT.md` de cada um; o `CONTEXT.md` é **glossário puro** (termo, definição de
uma ou duas linhas, termos a evitar — nada de racional nem de implementação); **toda decisão com
explicação é um ADR** numerado `NNNN-slug.md`, em `docs/adr/` da raiz quando é de sistema e em
`apps/<app>/docs/adr/` quando é do app, com um `README.md` por diretório como índice por tema —
a única peça que a skill não pede e que mantemos, porque é o que sustenta o protocolo "leia o
índice, abra um arquivo" com quase duzentas decisões.

**O `docs/context/` da API foi migrado inteiro** (decisão do dono, entre migrar agora e congelar
como histórico): cada seção `###` virou um ADR (`0011`–`0195`), com o texto original e uma
linha de proveniência; os dez ADRs que já existiam foram renumerados na ordem cronológica
(`0001`–`0010`); os grupos que eram resumo de um ADR existente foram anexados a ele; `schema.md`
e `history.md`, que descrevem e não decidem, foram para `docs/reference/`. Migrar por demanda
deixaria dois sistemas coexistindo por tempo indefinido e um `CLAUDE.md` explicando os dois.

**No mesmo passo caiu a regra "documento permanente não cita o tracker"** (9.12/AC5,
retargetada na Fase 10). Ela nasceu de um ADR que citava um `§` de um documento de planejamento
escrito para ser descartável — e a resposta certa então foi proibir a citação. O que mudou não
foi a disciplina, foi a natureza do arquivo: as specs e issues de `.scratch/` são o tracker
versionado do fluxo das skills, arquivos fixos com endereço estável, e é assim que a skill
original funciona — o ADR cita a issue que o originou. O `docs:check` deixou de ter a checagem de
citação efêmera e a lista de exceções dela; continua provando que o caminho citado existe
(inclusive quando é um arquivo de `.scratch/`) e que toda spec fechada nomeia o destino do porquê
— que agora é um ADR.

**Consequências.** Decisão nova é ADR novo mais uma linha no índice do app; termo novo vai para
o `CONTEXT.md`, e só o termo. O glossário da API é escrito do zero na issue 08, destilado dos
ADRs. Os ADRs migrados têm títulos em português e os originais em inglês; a numeração é o que os
ordena, e o slug não é contrato.

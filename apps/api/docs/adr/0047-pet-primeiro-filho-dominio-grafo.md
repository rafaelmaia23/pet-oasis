# Pet é o primeiro filho de **domínio** do grafo (9.4)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Ciclo de vida** › *Restauração*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Até a Fase 8 o grafo de ciclo de vida era só autorização: `User` → perfis → `UserRole` →
`UserFeature`. `Pet` entra pendurado no perfil de cliente e é o primeiro nó que não é
privilégio nenhum — o que obriga a perguntar de novo onde cada direção para.

**Descendo, nada muda:** pet entra na cascata porque o D1 não admite filho ativo de pai morto,
com o mesmo `new Date()` da transação (D4). A deleção do perfil de **funcionário** não toca pet
algum — só o cliente é dono.

**Subindo, ele acompanha `UserRole`, não `UserFeature`.** É aqui que o critério do D6' mostra
que era sobre risco, e não sobre profundidade: a restauração para onde para para não **vazar
privilégio**, e devolver a ficha do bichano ao dono não concede autoridade nenhuma. Deixá-lo
morto seria perda de dado pura — não há endpoint de restauração de pet que compensasse, e o
dono reativado voltaria sem os próprios animais. Então vale a regra recursiva já existente:
volta o filho cujo `deletedAt` é **igual** ao do pai, lido antes de zerá-lo. O pet que o dono
excluiu de propósito noutro instante não bate, e continua excluído — sem nenhuma regra extra.

Regra prática para o próximo nó de domínio (pedido, na Fase 10): pergunte se restaurá-lo
concede **autoridade**. Se não concede, ele sobe junto; se concede, para.

As contagens entram no audit (`cascadedPets` em `USER_DELETED`/`USER_PROFILE_DELETED`,
`restoredPets` em `USER_PROFILE_RESTORED`/`ACCOUNT_REACTIVATION_COMPLETED`) pelo mesmo critério
do K6: a cascata derruba coisa que não aparece na resposta 204, e a contagem é o único rastro.

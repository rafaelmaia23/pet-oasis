# Autorização sempre antes da busca

> Decisão migrada em 2026-09-18 do contexto temático da API (**Autorização** › *Ordem e forma da checagem*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Se buscasse primeiro, alguém sem `:others` saberia se um id existe (404) ou não (sem erro) —
vaza existência. Checando `canActOnResource(user, feature, targetId)` antes, usando o id da
URL como `ownerId` e sem query, quem não tem `:others` recebe **403 igual** para id existente
ou inexistente.

**A ordem deixou de ser hábito e virou estrutura (Fase 12, `.scratch/fase-12-module-depth/issues/07-autorizar-antes-de-buscar-vira-primitiva.md`).**
Até aqui cada serviço reescrevia a sequência à mão — o `canActOnResource`, o 403 com o nome da
feature digitado em prosa, a busca, o 404 —, e um call site novo podia inverter os dois passos sem
nada reclamar. Um já invertia: `getUserByEmail` buscava antes de autorizar, que é exatamente o
vazamento proibido acima; tinha zero callers e zero testes, e foi **removido** em vez de
corrigido — guard que ninguém alcança é guard cujo erro ninguém viu.

O dono da ordem agora é `authorizeThenLoad`, em [`src/lib/authorization.ts`](../../src/lib/authorization.ts).
Quem chama passa o ator, a feature exigida e **como** carregar o alvo; a ordem não é parâmetro,
então não há como pedi-la errada. São três modos, e o que muda entre eles é de onde vem o dono do
recurso — a ordem é consequência disso:

- **`owner-in-url`** — o dono é o id da URL (`/users/:id`): autoriza e só então busca. É o caso do
  usuário e do perfil de cliente.
- **`no-owner`** — a feature não tem par self/`:others` porque nunca há self-service (D11, perfil de
  funcionário): a posse da feature é a checagem inteira, e ela também corre antes da busca.
- **`fail-closed`** — o dono só aparece no registro (`/customers/:customerId` traz o id do *perfil*,
  não o do usuário), então buscar primeiro é inevitável; o que preserva a invariante é o alvo
  inexistente responder **igual** ao alheio. É o caso do pet, e virou um modo nomeado da mesma
  primitiva em vez de um par de helpers próprio.

O `action` do 403 passou a ser **derivado** da feature exigida, com a variante que de fato faltou
(`read:user` para quem age sobre si, `read:user:others` para quem age sobre outro) — antes ele era
digitado em cada site e, no serviço de usuário, dizia `:others` mesmo no ramo em que a feature
faltante era a simples. A frase que o descreve tem um dono só, `createFeatureForbiddenError`,
compartilhado com o porteiro da rota (`canAccess`), onde ela vivia em cópia.

Fora do escopo, e por decisão: os `resolveX` do catálogo (marca, categoria, tag, produto, variante,
imagem) continuam como estão. São carrega-ou-404 puros, autorizados pelo `canAccess` da rota, e não
têm o hazard de ordem — arrastá-los para a primitiva os obrigaria a receber ator e feature que não
usam.

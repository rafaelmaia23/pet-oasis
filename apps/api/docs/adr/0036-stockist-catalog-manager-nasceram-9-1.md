# `stockist` e `catalog-manager` nasceram na 9.1

> Decisão migrada em 2026-09-18 do contexto temático da API (**Autorização** › *Roles de funcionário*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Com o catálogo inteiro caindo em `manager`, ele viraria role-monólito e as features finas
acima nasceriam sem nenhum dono — o sinal clássico de granularidade inventada. As duas roles
novas dão cargo a cada corte: `stockist` = self-management + `read:product:internal` +
`manage:stock`; `catalog-manager` = self-management + estoque + autoria + custo. Nenhuma das
duas toca usuário, permissão ou ban.

`manager` é **superconjunto** de `catalog-manager` (garantido por teste): as roles existem para
delegar, não para tirar poder de quem já tinha. A sobreposição de `manage:stock` entre
repositor e gerente de catálogo é intencional — quem cadastra o produto também corrige
contagem.

Recusadas por ora: `veterinarian` e `groomer`. Serviço é assunto da Fase 10 (ver
[`adr/0008-product-vs-service.md`](0008-product-vs-service.md)), e role sem endpoint é role morta.

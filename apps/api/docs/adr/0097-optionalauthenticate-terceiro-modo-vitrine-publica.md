# `optionalAuthenticate` — o terceiro modo, para a vitrine pública (9.6)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Arquitetura** › *Roteamento*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

`authenticate` é tudo-ou-nada: ele já tolerava a **ausência** de header (segue sem `req.user`, e quem
dá o 401 é o `canAccess` depois), mas token malformado ou expirado ainda virava 401. A vitrine
pública decidida na 9.1/N15 não pode fazer isso — `GET /brands` atende o visitante que chegou pelo
Google e o funcionário logado, e um token velho no header do navegador não pode transformar a
listagem de marcas em erro.

`optionalAuthenticate` (mesmo arquivo, `authenticate.middleware.ts`) resolve o ator quando dá e
**segue anônimo quando não dá**, nunca lançando. Os dois modos dividem uma única função de resolução
token→ator: o que muda entre eles é exclusivamente o que se faz com a falha. Duplicar seria duplicar
`verifyAccessToken` + `computeEffectiveFeatures` + `setActorId`, e é justamente `setActorId` que faz o
visitante identificado aparecer no access log e no audit.

Consequência para quem escreve rota: **rota montada com `optionalAuthenticate` lê `req.user` direto,
nunca via `getAuthUser`** — o helper lança 401 quando ele falta, que é o oposto do contrato aqui. A
escrita no mesmo router continua protegida de graça, porque `canAccess` já responde 401 sozinho sem
`req.user`. Montado em `/brands`, `/categories` e `/tags` (9.6); `/products` (9.8) usa o mesmo
middleware, ali para escolher a view pela capability do viewer.

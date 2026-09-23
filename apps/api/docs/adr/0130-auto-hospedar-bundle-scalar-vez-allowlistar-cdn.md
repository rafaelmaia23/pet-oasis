# Auto-hospedar o bundle do Scalar em vez de allowlistar o CDN

> Decisão migrada em 2026-09-18 do contexto temático da API (**Segurança** › *Hardening HTTP*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

`helmet()` traz CSP com `script-src 'self'`, que bloqueia o `cdn.jsdelivr.net` de onde o
`/reference` carregava o Scalar. Allowlistar o CDN seria uma linha, mas autorizaria um terceiro a
executar script na própria origem — enfraquecendo exatamente o que o helmet foi ligado para dar.
Servir o bundle do próprio domínio mantém a CSP estrita e faz o `/reference` funcionar sem
internet. Custo: um asset no build e atualização manual quando o Scalar subir de versão.

Servido pela rota pública `GET /scalar/standalone.js` (router de topo, `Cache-Control` de 7 dias),
com o caminho resolvido **em runtime** (`createRequire(...).resolve` na raiz do pacote +
`browser/standalone.js`, porque o subpath não está no `exports` do `@scalar/api-reference`) — assim
dev (tsx) e produção (bundle do tsup) usam o mesmo código. `withDefaultFonts: false` e
`telemetry: false` completam a promessa: a página não faz chamada a terceiro por design.

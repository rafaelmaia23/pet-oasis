# A auto-hospedagem sozinha não bastou — o nonce é a segunda peça (7.1)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Segurança** › *Hardening HTTP*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

A análise original concluía que "um nonce não resolveria, porque o script continua sendo externo".
Verdadeiro para o script do CDN e **insuficiente** na prática: com o bundle auto-hospedado, sobrou
um segundo script — o Scalar inicia por um `<script>` **inline**
(`Scalar.createApiReference(...)`), que `script-src 'self'` também bloqueia. Sem nonce,
`/reference` responde 200 com a UI em branco: falha invisível para `curl` e para qualquer teste que
só cheque status. As duas peças são necessárias — auto-hospedagem para o bundle, **nonce por
request** para o init inline (nunca `'unsafe-inline'`, que anularia a proteção). Daí também a regra
de validar CSP no navegador, não no terminal.

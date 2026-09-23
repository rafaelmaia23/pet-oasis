# Sobram violações de CSP no console de `/reference`, e elas ficam

> Decisão migrada em 2026-09-18 do contexto temático da API (**Segurança** › *Hardening HTTP*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Três coisas continuam bloqueadas e nenhuma quebra a UI: um `eval` que o bundle usa como *feature
detection* (com fallback), um `<script>` que ele injeta em runtime sem repassar o nonce, e as
chamadas ao diretório público de APIs do próprio Scalar (`api.scalar.com`). Silenciá-las custaria
`'unsafe-eval'` (a diretiva mais perigosa da CSP) e um `connect-src` para terceiro — preço alto
para trocar ruído de console por segurança real. Ficam documentadas em `src/docs/reference.ts` como
esperadas, para não serem lidas como regressão depois.

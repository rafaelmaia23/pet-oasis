# `read:audit-log:full` e não uma role como âncora

> Decisão migrada em 2026-09-18 do contexto temático da API (**Observabilidade** › *Audit log*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

O `ip` sai mascarado (`192.168.1.***`) por padrão; a feature destrava o valor inteiro. Segue o
padrão `ação:recurso:modificador` já usado no catálogo (`read:user:others` — o modificador nem
sempre é `:others`). Assim o mascaramento vira demonstração de RBAC dentro da própria resposta (o
demo lê a trilha e vê IP mascarado; um admin vê inteiro), e a visibilidade de IP fica concedível
por override sem carregar junto o poder de banir que reusar `manage:user:status` traria. Features
novas no singular, como o resto do catálogo: **`read:log`** (ring buffer) e **`read:audit-log`**
(+ `:full`). Por destravar PII, `read:audit-log:full` entrou em `PRIVILEGED_FEATURES` —
ver [índice de ADRs](README.md#não-escalação).

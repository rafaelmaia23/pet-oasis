# Custo/margem **não** entrou em `PRIVILEGED_FEATURES`

> Decisão migrada em 2026-09-18 do contexto temático da API (**Autorização** › *Catálogo de features*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

O guard de não-escalação existe contra escalar o próprio sistema de permissão; `read:product:cost`
é segredo comercial, não poder sobre o RBAC. Colocá-lo lá obrigaria o admin a intermediar todo
ajuste comercial fino e diluiria o significado do conjunto para "dado sensível em geral" — e o
próximo campo sensível quereria entrar também. O contra-argumento é honesto e ficou registrado:
`read:audit-log:full` já é dado sensível, não escalação. A escolha foi manter o conjunto no
sentido estrito e deixar a delegação de custo com o gerente, que é de quem a decisão é.

# O override pendura na atribuição de role, não no usuário (D2)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Autorização** › *Escopo do override*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Override é sobre a **função**, não sobre a pessoa. Escopo de usuário deixava um ajuste
concedido "pro trabalho de estoquista" sobreviver à perda da role de estoquista — e, pior, à
deleção do perfil inteiro de funcionário, virando vazamento de privilégio. Escopo de *perfil*
foi cogitado e recusado: grosso demais, não captura mudança de função dentro do mesmo perfil.

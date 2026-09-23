# Token inválido/expirado/usado é 400 genérico

> Decisão migrada em 2026-09-18 do contexto temático da API (**Identidade e sessões** › *Verificação de email*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

O token é sintaticamente válido (passou no Zod) mas imprestável: não é erro de validação de campo
(o 422 do projeto carrega `errors` por campo, que não encaixa num token opaco) nem credencial de
sessão (401 é para Bearer/refresh). É um `createBadRequestError` que **não vaza qual** condição
falhou (inexistente × expirado × usado). Sucesso → **204**, idioma do projeto para ação sem corpo.
O mesmo vale no `reset-password`.

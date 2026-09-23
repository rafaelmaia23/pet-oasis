# Usuário travado responde 429 genérico

> Decisão migrada em 2026-09-18 do contexto temático da API (**Segurança** › *Rate limit e lockout*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Login com senha errada continua 401 genérico (nenhuma identidade estabelecida). Rate limit por
IP e lockout por usuário devolvem o **mesmo** 429 — mesmo `code`, mesma prosa —, sem confirmar a
existência do usuário além do que as tentativas anteriores já revelam: mesmo espírito
anti-enumeração de `forgot-password`/`verify-email/resend`. O que os distingue é só o **valor**
de `Retry-After`, que ambos carregam desde a 10.22: a decisão original dizia "sem indicar qual
disparou", e por um tempo só o rate limit mandava o header enquanto três documentos (guia de
integração, `endpoints.md`, spec) prometiam-no também no lockout. A API passou a cumprir — tempo
real até o fim da janela, em segundos arredondados para cima, pelo mesmo `headers` do
`AppError` — e a distinção pelo valor é aceita porque o 429 de lockout só dispara com a senha
certa. O número mora só no header. Racional completo na seção "Resposta 429 genérica" do ADR.

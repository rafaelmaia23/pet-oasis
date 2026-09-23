# Rate limit por IP e lockout por usuário são dois mecanismos, não um

> Decisão migrada em 2026-09-18 do contexto temático da API (**Segurança** › *Rate limit e lockout*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Têm alvos diferentes. **Por IP** protege contra volume (DoS, scraping, spam de criação de
usuário) sem se importar com qual usuário é tentado. **Por usuário** protege uma credencial
específica contra força bruta direcionada, mesmo vinda de IPs diferentes (credential stuffing
distribuído). Um não substitui o outro.

Existe ainda uma **terceira chave, por email destinatário**, em `forgot-password` e
`verify-email/resend`: ela fecha o furo do atacante que rotaciona IP para bombardear a caixa de
uma vítima específica — cada request vem de um IP novo (o limite por IP não vê nada), mas a
caixa do alvo recebe tudo e a reputação do domínio remetente queima.

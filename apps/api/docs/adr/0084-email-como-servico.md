# Email como serviço

> Decisão migrada em 2026-09-18 do contexto temático da API (**Identidade e sessões**), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

`send({to, subject, html, text})` em `src/lib/email.ts` não sabe de verificação/reset — recebe o
email pronto. Isso o deixa reusável para o que vem depois (lembretes de agendamento, confirmações de
serviço/venda). Transporter configurado por `env` (dev aponta para o mailpit no docker; produção usa
SMTP da Resend com `secure: true`). Falha de envio → `createServiceUnavailableError` (503).

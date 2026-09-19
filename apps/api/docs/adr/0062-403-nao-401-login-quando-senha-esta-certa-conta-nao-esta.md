# 403 (não 401) no login quando a senha está certa mas a conta não está ACTIVE

> Decisão migrada em 2026-09-18 do contexto temático da API (**Identidade e sessões** › *Status da conta*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Senha errada é 401 genérico (não se sabe quem é). Uma credencial correta **estabelece a
identidade** — o que falta é permissão de entrar, semanticamente 403. Mensagens distintas (PENDING
→ "verifique seu email"; BANNED → "conta suspensa, contate o suporte") orientam o dono. Trade-off
aceito: o 403 revela que a senha estava correta, mas quem chegou até aqui provou posse da senha.

**`code` por condição (10.8).** As três recusas pós-senha — `ACCOUNT_BANNED`,
`PASSWORD_RESET_REQUIRED`, `EMAIL_NOT_VERIFIED` — respondiam todas `code: FORBIDDEN` e diferiam só
na prosa em pt-BR, então um cliente que quisesse a tela certa teria de casar string em português.
O identificador passou a ser parametrizável nas factories de erro (o **status** continua fixo por
subclasse; só o `code` ganhou default sobrescrevível) e o login nomeia um por condição. Os status
**não** mudaram: trocar por 401 seria quebra de contrato num endpoint documentado em três lugares,
em troca de nada — a semântica acima continua valendo. Não há vazamento novo: os três só disparam
depois de a senha conferir, e credencial errada e email desconhecido seguem indistinguíveis
(mesmo 401, mesmo `code`, mesma mensagem). A ordem de avaliação também não mudou: lockout (429) →
banida → senha forçada → não verificada.

# Ordem de checagem no `refresh`: reuso → invalidada → expirada

> Decisão migrada em 2026-09-18 do contexto temático da API (**Identidade e sessões** › *Sessão e refresh*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Sempre a mesma mensagem 401 genérica nas três (não revela qual checagem falhou). A ordem importa:
`usedAt` é checado primeiro porque é o único caso que dispara **efeito colateral** — replay de um
token já usado aciona `invalidateAllUserSessions(userId)`, matando **todas** as sessões do usuário
(não só a reutilizada), já que reuso é o sinal mais forte de que o refresh token vazou e o
dispositivo legítimo não é mais o único de posse dele.

**Nota de consistência:** `invalidateAllUserSessions` (resposta a roubo) e
`softDeleteUserAndInvalidateSessions` (usuário deletado) usam `where` diferentes de propósito. A
primeira invalida por `invalidatedAt: null, expiresAt: { gt: now }` **sem** excluir `usedAt`,
porque numa resposta a roubo o objetivo é marcar `invalidatedAt` em toda sessão para auditoria
completa, inclusive as já usadas. A segunda inclui `usedAt: null`, porque ali o objetivo é só
limpar sessões que ainda poderiam ser usadas — não é resposta a incidente, é encerramento de conta.

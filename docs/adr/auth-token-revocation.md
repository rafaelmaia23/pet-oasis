# Dívida — Revogação de token e armazenamento (auth)

> Decisão adiada, registrada para revisão futura. Não é bug: é um trade-off consciente do design JWT stateless.

## O problema

Com JWT stateless (validado localmente, sem consultar o banco), **não dá para revogar um access token antes de ele expirar**. No logout, a sessão de refresh morre na hora (não renova mais), mas o access token continua válido até seu TTL vencer. Janela atual: **até 15min** de "token válido após logout".

Isso é inerente ao JWT stateless — é o que dá a performance (sem query por request), ao custo de não ser revogável instantaneamente. Onde o token é guardado (cookie vs header) **não** muda isso; é problema ortogonal.

---

## Decisão atual ✅

**TTL curto + aceitar a janela.** Access token JWT (15min) validado localmente; logout invalida o refresh (sessão não renova); access morre sozinho em ≤15min. Token entregue via **header Bearer** (`Authorization: Bearer <jwt>`) — o cliente guarda e envia.

Proporcional para o estágio atual (pet shop, ciclo de aprendizado). O cenário de dano exige um atacante que já tem o token copiado — comprometimento anterior.

---

## Duas decisões independentes (não misturar)

### A) Como revogar antes de expirar

| Opção | Prós | Contras |
|---|---|---|
| **TTL curto + aceitar janela** ✅ | Simples; sem estado extra; é o que a maioria faz | Janela de até 15min pós-logout |
| Reduzir TTL (ex.: 5min) | Encolhe a janela; só ajustar um número | Mais refreshes (a cada 5min) |
| Blocklist (Redis) | Revoga na hora; Redis é rápido | Consulta por request; infra Redis; guarda tokens até expirarem |
| Token version (campo no user) | Revoga "tudo de uma vez" (logout-all, troca de senha) sem Redis | Consulta ao user; pouco granular p/ deslogar 1 dispositivo |
| Voltar a stateful (sessão no banco por request) | Revoga na hora | Query por request — é o que a Fase 3 saiu de propósito |

### B) Onde guardar o access token

| Opção | Prós | Contras |
|---|---|---|
| **Header Bearer (front guarda)** ✅ | Universal (browser, mobile, API); simples de CORS; sem CSRF | Armazenamento depende do cliente fazer certo (XSS se em localStorage); logout depende do front descartar |
| Cookie httpOnly (servidor controla) | JS não lê (protege de XSS); servidor controla ciclo de vida; não depende do front | CSRF (precisa SameSite/anti-CSRF); ruim p/ clientes não-browser (mobile/API); config de domínio/CORS |
| Cookie **ou** header (middleware aceita os dois) | Flexível: browser usa cookie, mobile/API usa header; atende "não sei qual cliente" | Middleware um pouco mais complexo (lê das duas fontes) |

**Nota:** cookie httpOnly **não** resolve a janela pós-logout (item A) — apagar o cookie depende do browser cooperar e não afeta cópias roubadas. Cookie resolve *armazenamento seguro* e *não depender do front*, não *revogação*.

---

## Quando revisitar

- Se o app passar a lidar com dados sensíveis (financeiro, dados pessoais além do básico) → considerar blocklist (A) para fechar a janela.
- Se surgir requisito de "deslogar de todos os dispositivos" ou "trocar senha derruba tudo" → token version (A).
- Ao definir o(s) cliente(s) real(is) → decidir B (cookie se só browser; header ou ambos se mobile/API entram).
- Tensão registrada: "não depender do front" puxa p/ cookie; "backend universal, cliente desconhecido" puxa p/ header. "Aceitar ambos" resolve.

---

## Onde guardar este arquivo

Sugestão: `docs/adr/` (Architecture Decision Records) na raiz do projeto — ex.: `docs/adr/auth-token-revocation.md`. Se o projeto ainda não tem pasta de docs de decisão, `docs/decisoes/` também serve. O importante é ficar fora de `src/` (não é código) mas versionado no repo, perto do CONTEXT.md/CLAUDE.md para consulta.

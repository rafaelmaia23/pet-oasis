# Errata — documentação do `pet-oasis-web`

Achados na grelha de kickoff da Fase 10, lendo os dois repos lado a lado. São pontos em que a
documentação do front afirma algo **factualmente diferente** do que a API faz ou vai fazer.
Nenhum deles é opinião: cada um cita a linha da API que o contradiz.

Este arquivo é para entregar a quem mantém o `pet-oasis-web`, e **morre quando for aplicado**.
O conteúdo permanente correspondente vive em `apps/api/docs/guides/integrating-with-the-api.md`, do
lado da API — quando esta errata sumir, nada se perde.

---

## 1. As recusas de login são 403, não 401 — e hoje são indistinguíveis

**Onde:** `CLAUDE.md` do front, seção "⚠️ REGRA — A API é a autoridade", parágrafo "Conta
pendente não entra".

**O que está escrito:**

> O login da API recusa em três condições, nesta ordem: banido → troca de senha forçada →
> status pendente. Todas respondem **401** e nenhuma deixa a pessoa alcançar o interior da
> aplicação.

**O que a API faz** (`src/modules/auth/auth.service.ts`, ramos `bannedAt`,
`mustChangePassword` e `status !== "ACTIVE"`): as três lançam `createForbiddenError` → **403**.
A ordem está certa. O status, não. E há uma quarta que falta na lista: conta travada por
tentativas erradas responde **429**, antes das três.

**O que muda:** a Fase 10 acrescenta um `code` estável por condição, porque hoje as três
carregam `code: "FORBIDDEN"` idêntico e diferem só na prosa em pt-BR — casar string em
português seria a única forma de cumprir a promessa de "mensagem por condição". Depois da
issue `07`:

| Condição | Status | `code` |
|---|---|---|
| Email desconhecido ou senha errada | 401 | `UNAUTHORIZED` |
| Conta travada por tentativas erradas | 429 | `TOO_MANY_REQUESTS` (com `Retry-After`) |
| Conta banida | 403 | `ACCOUNT_BANNED` |
| Troca de senha forçada | 403 | `PASSWORD_RESET_REQUIRED` |
| Conta não verificada | 403 | `EMAIL_NOT_VERIFIED` |

Ramifique por `code`, nunca por `message`.

**Correção necessária:** trocar "401" por "403" no parágrafo, acrescentar o 429 do lockout, e
dizer que a ramificação é por `code`.

---

## 2. A tabela de erro manda a tela de login exibir a mensagem errada

**Onde:** `CLAUDE.md` do front, seção "Erro e carregamento".

**O que está escrito:** a linha `403 → Toast barulhento — é sinal de can() esquecido`.

**Por que está errado:** decorre do item 1. Como as três recusas de login **são** 403, a
tela de login cairia nessa linha e mostraria um toast de erro de programação em vez de
"verifique seu email para ativar a conta". O usuário legítimo veria o diagnóstico errado
exatamente no momento em que mais precisa da instrução certa.

**Correção necessária:** a regra do toast barulhento vale para 403 **em rota autenticada**. Na
tela de login, 403 é estado esperado e ramifica por `code`, como a linha do 401 já faz hoje.
São duas linhas na tabela, não uma.

---

## 3. `http://api:3000` estava errado quando foi escrito, e passou a estar certo

**Onde:** `../pet-oasis-web/docs/adr/0004-apex-for-frontend-api-on-subdomain.md`.

**O que está escrito:** `http://api:3000/api/v1`.

**O que era verdade:** o serviço no Compose de produção da API se chamava `app`
(`container_name: pet-oasis-app`), e o DNS do network publicava **`app`**. A chamada teria
falhado em resolução de DNS no primeiro deploy conjunto.

**O que muda:** a issue `01` da Fase 10 renomeia o serviço para `api` e o container para
`pet-oasis-api`, com alias de rede explícito. **Nenhuma correção é necessária no ADR** —
ele descreve o estado-alvo, e a API veio ao encontro dele. Registrado aqui só para você saber
que o acerto foi por correção nossa e não por sorte, e para não mexer no ADR achando que está
errado.

---

## 4. A rede a que o front se junta muda de nome

**Onde:** `.env.example` do front (`API_NETWORK=pet-oasis-prod_default`) e
`infra/docker-compose.prod.yml` (bloco `networks:`).

**O que muda:** hoje o front se junta ao network **default do projeto compose** da API. A
issue `02` declara redes explícitas, e a compartilhada passa a ser **`pet-oasis`** — nome
fixo, não derivado do nome do projeto:

```yaml
networks:
  petoasis:
    external: true
    name: pet-oasis
```

Há três redes na API, e o front entra em **duas**: `pet-oasis` (para falar com a API) e
`proxy` (para o nginx alcançar o front). A terceira, `backend`, é `internal: true` e guarda
Postgres e Redis — o front não a alcança, de propósito.

**Correção necessária:** `API_NETWORK=pet-oasis` no `.env.example`, e o comentário do compose
que hoje explica "é o network default do projeto compose de produção da API" passa a explicar
que é uma rede nomeada e dedicada.

---

## 5. O rate limit deixa de ser problema, mas o contrato é do front

**Onde:** `../pet-oasis-web/docs/adr/0004`, consequência "O rate limit por IP da API deixa de
funcionar como pretendido" e a frase final "**Até lá, a vitrine com busca fica bloqueada**".

**O que muda:** a issue `02` resolve pelo lado da API, mas **não** com os dois saltos que o
ADR antecipa. `app.set("trust proxy", 2)` seria errado aqui: existem duas cadeias vivas ao
mesmo tempo (`visitante → nginx → api`, com um salto, e `visitante → nginx → front → api`, com
dois), e nenhuma contagem única serve as duas. A API passa a confiar por **endereço de
origem**:

```ts
app.set("trust proxy", ["loopback", "uniquelocal"]);
```

O Express caminha o `X-Forwarded-For` da direita para a esquerda pulando endereços confiáveis.
Isso significa que **copiar ou acrescentar ao header, tanto faz** — o front não precisa acertar
o formato, só precisa repassar o IP do visitante.

**Correção necessária:** trocar "a API confiar em dois saltos" por "a API confiar por endereço
de origem", e derrubar a frase de bloqueio quando a issue `02` fechar.

**O que continua sendo obrigação do front:** repassar `X-Forwarded-For` em toda chamada feita
**em nome de um visitante**. Chamada que não é de visitante (job, health check) não manda o
header.

---

## 6. `Session` não é a sessão de um dispositivo

**Onde:** `CONTEXT.md` do front — o termo não está no glossário, e a arquitetura de sessão
depende dele.

**O fato** (`src/modules/auth/auth.repository.ts`, `rotateSession`): cada rotação **cria uma
linha nova** e marca a anterior com `usedAt`. Uma linha de `Session` é um **elo de uma corrente
de rotação**, não a sessão de um dispositivo. `GET /auth/sessions` parece "um por dispositivo"
só porque filtra os elos usados.

**Consequência para a interface:** o `id` de uma sessão **muda a cada renovação** — ou seja, a
cada 15 minutos. Uma tela de "meus dispositivos" que guarde o `id` entre renderizações vai
mirar um alvo que já não existe, e `DELETE /auth/sessions/:id` responderá 404 sem que nada
esteja errado. Releia a lista antes de agir sobre ela.

**Correção necessária:** entrada no glossário do front, com o *Avoid* apontando para o uso de
"sessão" como sinônimo de dispositivo.

---

## 7. A janela de graça muda o que um 503 no refresh significa

**Onde:** `../pet-oasis-web/docs/adr/0001-bff-session-in-frontend.md` (as três travas contra falso
positivo de reuso) e a linha `5xx → error.tsx com retry` da tabela de erro.

**O que muda:** a issue `09` aceita o refresh imediatamente anterior por **10 segundos** a
partir do `usedAt`, devolvendo **o mesmo par** já emitido naquela rotação. Reuso fora da janela
continua sendo roubo e continua derrubando todas as sessões.

**Duas coisas que o front precisa saber:**

1. **A janela não substitui o single-flight.** Ela é rede de segurança para a corrida que sobra
   quando houver segunda réplica ou segundo cliente — não licença para renovar em paralelo.
   Mantenha as três travas.
2. **Um 503 no `/auth/refresh` é retentável e não destrói nada.** Se a API não conseguir
   reproduzir o par dentro da janela (Redis fora do ar), ela responde 503 em vez de decidir
   entre concorrência e roubo. É o único 5xx da API que significa "tente de novo em um
   instante", e tratá-lo como falha de sistema desloga alguém sem necessidade.

---

## Resumo do que corrigir

| # | Arquivo do front | Ação |
|---|---|---|
| 1 | `CLAUDE.md` | 401 → 403 nas recusas de login; acrescentar o 429; ramificar por `code` |
| 2 | `CLAUDE.md` | Separar "403 em rota autenticada" de "403 na tela de login" |
| 3 | `docs/adr/0004` | Nada — a API veio ao encontro do ADR |
| 4 | `.env.example` + `infra/docker-compose.prod.yml` | `API_NETWORK=pet-oasis` |
| 5 | `docs/adr/0004` | "dois saltos" → "por endereço de origem"; derrubar o bloqueio da busca |
| 6 | `CONTEXT.md` | Entrada nova: `Session` é elo de corrente, `id` instável |
| 7 | `docs/adr/0001` + `CLAUDE.md` | Janela de graça; 503 no refresh é retentável |

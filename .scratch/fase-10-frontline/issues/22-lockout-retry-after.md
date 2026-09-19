# 22: `Retry-After` no 429 de conta travada

**What to build:** quem tenta entrar com a senha certa numa conta travada por lockout recebe,
junto do 429, **quanto tempo esperar** — o header `Retry-After`, em segundos, como o rate limit
já faz. Hoje só o rate limit manda o header; o lockout responde 429 seco, e o guia de
integração, o `endpoints.md` e a descrição OpenAPI do login **prometem** o header nos dois
casos. A revisão final do guia (issue 23) achou a promessa falsa; esta issue faz a API cumpri-la
em vez de reescrever três documentos para dizer "às vezes".

Adendo à fase, decidido em grelha em 2026-09-16 junto com a 23: o guia é o que o front vai usar
para se construir, e "aguarde N segundos" com N vindo do header é o contrato que ele já descreve
para todo 429.

**Blocked by:** None (can start immediately).

**Status:** fechada em 2026-09-16

**Decisões (usuário, 2026-09-16):**

- O valor é o tempo até o fim da janela de lockout, arredondado para cima em segundos, mínimo 1
  — **o mesmo cálculo** do rate limit. Não é o teto do backoff nem um valor arredondado por
  política: é o tempo real, porque o guia manda o cliente "usar o valor, não uma mensagem
  genérica", e um header que mente quebra exatamente esse contrato.
- `message` e `action` do 429 continuam genéricas ("aguarde antes de tentar novamente"). O
  número mora **só no header** — uma fonte de verdade; o cliente renderiza "tente em N" a
  partir dele.
- O `code` continua `TOO_MANY_REQUESTS` nos dois 429. Distinguir lockout de rate limit por
  `code` (um `ACCOUNT_LOCKED`) é outra decisão de produto, só vale se o front quiser telas
  diferentes, e **não** foi tomada aqui.
- O ADR de rate limit e lockout diz que os dois 429 são indistinguíveis. Com o header nos dois,
  a **forma** volta a ser idêntica; o **valor** distingue (segundos num, minutos a horas no
  outro). Aceito e narrado: o 429 de lockout só dispara **depois** de a senha conferir, então
  quem o recebe é o dono da conta ou alguém que já tem a senha — para esse, saber a duração não
  muda nada que a política por IP não trate. A seção do ADR é **reescrita narrando a emenda**,
  não decisão nova + errata.
- Fail-open inalterado: store de lockout fora do ar → conta destravada, sem 429, sem header.
  Nunca um 429 com `Retry-After` inventado.

## Critérios

- [x] A consulta de estado do lockout passa a devolver **quando** a trava acaba, não só se está
      travada — é o único dado que falta; o instante já vive no store desde a Fase 7.
- [x] O login, no ramo de conta travada, anexa `Retry-After` ao 429 pelo mesmo mecanismo do rate
      limit (o header viaja no erro, e o handler central aplica) — sem `res` no service.
- [x] Testes na fronteira HTTP, no padrão dos do lockout existentes: conta travada + senha certa
      → 429 **com** `Retry-After` presente, numérico, positivo e **dentro** da janela configurada
      (não se afirma o segundo exato). Vermelho antes da implementação.
- [x] Teste unitário da transição/consulta de estado afirmando o instante devolvido, e o
      fail-open (store indisponível → destravado, sem instante).
- [x] O componente 429 da especificação OpenAPI **declara** o header `Retry-After` — hoje ele não
      é declarado nem para o rate limit, e o cliente que gera tipos da spec não o vê.
- [x] `apps/api/docs/reference/endpoints.md` e a descrição OpenAPI do login **não mudam**: já dizem "429
      com `Retry-After`" e passam a ser verdade. Conferir, não editar.
- [x] A seção "Resposta 429 genérica" do ADR de rate limit e lockout é reescrita narrando a
      emenda (mesmo `code`, mesma prosa, ambos com `Retry-After`, e por que o valor não é
      vazamento novo), com a linha correspondente no índice `apps/api/docs/adr/README.md`.
- [x] Caso novo em `tests/integration/v1/mass-assignment.test.ts` **não** se aplica: nenhum
      schema de escrita novo.
- [x] Suíte completa, `typecheck`, `lint` e `docs:check` verdes.

## O que foi feito

`getLockoutState` passou a devolver `lockedUntil` enquanto a trava vale — união discriminada
(`{ isLocked: true; lockedUntil: number } | { isLocked: false; lockedUntil: null }`), com
`isLocked` virando predicado de tipo para que o service não precise de fallback nem de `as`.
Fail-open intacto: store fora do ar → destravado, `lockedUntil: null`, sem header.

O header sai de um lugar só, `retryAfterHeader(ms)` em `src/errors/errorFactory.ts`, usado pelo
rate limit e pelo lockout: segundos arredondados para cima, **piso em 1** decidido uma vez. A
revisão de código achou que "o mesmo cálculo" já tinha nascido divergente (o piso só no lockout);
o helper é a correção. O piso é necessário no lockout e inócuo no rate limit: o service relê o
relógio depois de `getLockoutState` decidir que está travado, então o resto pode cair alguns ms
abaixo de zero; `msBeforeNext` de uma rejeição do limitador é sempre positivo.

Testes: unitário de `getLockoutState` (instante devolvido; `null` fora da janela; fail-open sem
instante), HTTP no bloco "Account lockout (7.10)" (429 com `Retry-After` inteiro, positivo e
dentro de `LOCKOUT_WINDOW_MS`), e `openapi.test.ts` afirmando o header declarado no 429 do login.
Vermelho verificado antes da implementação nos três seams.

OpenAPI: o componente 429 declara `Retry-After` (via `headers: z.object(...)`, que é a forma do
`zod-openapi` — não um mapa por header). `endpoints.md` e a descrição do login conferidos e
**não** editados: já diziam "429, com `Retry-After`".

Doc: seção "Resposta 429 genérica" do ADR reescrita narrando a emenda; o espelho em
`apps/api/docs/adr/README.md#segurança` também reescrito (a revisão achou a primeira versão em forma
"decisão + errata", com o parágrafo antigo dizendo "sem indicar qual disparou" logo acima do
novo); linha do índice atualizada. A revisão achou ainda, fora do diff, que
`apps/api/docs/guides/documenting-endpoints.md` lista só seis `errorResponses` e não fala de header —
foi para `docs/reference/backlog.md` (**P**), não para trás.

Suíte completa, `typecheck`, `lint` e `docs:check` verdes.

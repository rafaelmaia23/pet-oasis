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

**Status:** ready-for-agent

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

- [ ] A consulta de estado do lockout passa a devolver **quando** a trava acaba, não só se está
      travada — é o único dado que falta; o instante já vive no store desde a Fase 7.
- [ ] O login, no ramo de conta travada, anexa `Retry-After` ao 429 pelo mesmo mecanismo do rate
      limit (o header viaja no erro, e o handler central aplica) — sem `res` no service.
- [ ] Testes na fronteira HTTP, no padrão dos do lockout existentes: conta travada + senha certa
      → 429 **com** `Retry-After` presente, numérico, positivo e **dentro** da janela configurada
      (não se afirma o segundo exato). Vermelho antes da implementação.
- [ ] Teste unitário da transição/consulta de estado afirmando o instante devolvido, e o
      fail-open (store indisponível → destravado, sem instante).
- [ ] O componente 429 da especificação OpenAPI **declara** o header `Retry-After` — hoje ele não
      é declarado nem para o rate limit, e o cliente que gera tipos da spec não o vê.
- [ ] `docs/reference/endpoints.md` e a descrição OpenAPI do login **não mudam**: já dizem "429
      com `Retry-After`" e passam a ser verdade. Conferir, não editar.
- [ ] A seção "Resposta 429 genérica" do ADR de rate limit e lockout é reescrita narrando a
      emenda (mesmo `code`, mesma prosa, ambos com `Retry-After`, e por que o valor não é
      vazamento novo), com a linha correspondente no índice `docs/context.md`.
- [ ] Caso novo em `tests/integration/v1/mass-assignment.test.ts` **não** se aplica: nenhum
      schema de escrita novo.
- [ ] Suíte completa, `typecheck`, `lint` e `docs:check` verdes.

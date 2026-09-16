# 18: Os dois caminhos em que a cascata ainda dispara sem roubo

**What to build:** a marca de "já respondi 503" na linha de `Session`, para que a retentativa de
um 503 que chegue depois de a janela de graça fechar não seja lida como roubo. A janela (10.7) e
a caminhada pela corrente (10.15) tiraram a cascata do caminho da concorrência comum. Sobraram
dois caminhos em que ela dispara sem ninguém ter roubado nada. Os dois são estreitos. Os dois têm
o mesmo sintoma máximo: o dono da conta sai de todos os dispositivos.

**1. A retentativa do 503 que chega depois de a janela fechar.** Dentro da janela, sem par para
reproduzir, a API responde 503 e diz "tente de novo" — e o guia de integração diz o mesmo. Se a
retentativa chegar depois de `usedAt + 10s`, ela cai no ramo de roubo: 401 e cascata. O 503 promete
ser retentável exatamente no ramo em que a promessa pode não valer.

A versão **realista** desse caminho não é a evicção de chave, é o **Redis fora do ar por mais de
dez segundos**: o `rememberPair` falha em silêncio (é best-effort), a segunda requisição
concorrente leva 503, a retentativa imediata leva 503 de novo, o cliente faz backoff — e a
retentativa que passa dos 10 s cascateia. Isso torna falso, passados dez segundos, o invariante
que a 10.7 e a 10.15 escreveram em código e em doc: *Redis fora do ar não derruba sessão de
ninguém*.

O que reduz o peso: o refresh token é **cookie**. Num browser, duas abas mandam A; a primeira
recebe B no cookie, a segunda leva 503 e, ao retentar, já manda B — resolve sozinho. O caminho só
morde quem guarda a **própria cópia** de A fora do cookie jar (segunda réplica de um BFF,
processo separado). A marca é rede de segurança, não caminho quente.

Detalhe que estreita a variante de evicção: o TTL do Redis começa a contar **antes** de `usedAt`
ser gravado, então a chave costuma morrer um pouco antes da janela do banco — na direção segura
(503, não cascata).

**2. O cliente que passa do teto de saltos.** Mais de `REFRESH_GRACE_MAX_CHAIN_HOPS` rotações
dentro dos dez segundos, e o retardatário cai no caminho de sempre — cascata. Exige um cliente
patológico (mais de uma rotação a cada dois segundos), e o teto pode subir de graça em custo, mas
subir o teto move a fronteira em vez de removê-la.

**Blocked by:** None. Nada aqui é regressão: os dois caminhos são estritamente melhores do que o
que existia antes da 10.7, quando **toda** reapresentação cascateava.

**Status:** ready-for-agent

**Triagem:** ready-for-agent — decidido pelo usuário em 2026-09-16: caminho **(2b)** para o
caminho 1, com a sub-regra **(a)**; teto de saltos **mantido em 5** e o caminho 2 registrado
como exposição aceita.

## A pergunta

Hoje a regra é "sem certeza de que é concorrência → trata como roubo", com a janela e a corrente
comprando certeza onde é barato. A alternativa é inverter nas pontas: "sem certeza → não decide"
(503), e cascatear só com evidência positiva de reuso fora de qualquer janela.

Inverter custa detecção: um token roubado e reapresentado num momento infeliz ganharia 503 em vez
de derrubar a corrente. Não inverter custa o falso positivo descrito acima.

## Os caminhos

1. **Deixar como está**, com o aviso no guia. Custo zero, exposição conhecida e documentada —
   mas exigiria reescrever o invariante no contexto para ele parar de mentir.
2. **Lembrar o incidente no Redis.** No ramo de `MISS` (Redis vivo, chave sumida), gravar uma
   marca com TTL próprio; uma reapresentação que ache a marca recebe 503 outra vez, nunca
   cascata. Fecha só a variante de evicção. **Não fecha a variante realista** (Redis
   inalcançável), que é justamente onde não há onde gravar.
3. **Lembrar o incidente no banco (2b).** No ramo de 503 — `MISS` **ou** `UNAVAILABLE` —, gravar
   `graceDeferredAt` na linha de `Session` apresentada; `graceApplies` passa a valer também
   enquanto `graceDeferredAt + 30s > agora`. Fecha o caminho 1 inteiro, inclusive com o Redis
   caído. Custa uma migration (coluna nullable) e um `update` no ramo de erro. A detecção de
   roubo atrasa em até 30 s **só depois de um 503** — e o 503 já é sinal de incidente.
4. **Subir o teto de saltos** (fecha só o caminho 2, e só o move).

**Decidido: (2b)**, porque é o único caminho que torna verdadeiro o invariante já escrito. O teto
fica em **5**: rajada de mais de cinco rotações em dez segundos é anomalia de cliente, e a
cascata ali é resposta aceitável — a fatia que subir o teto fecharia é minúscula, e o teto baixo
mantém a cascata como resposta a comportamento anômalo. Registrar, não corrigir.

### Sub-regra: a retentativa que chega dentro da marca e ainda não acha par

Redis continua caído, ou a chave nunca existiu porque o Redis estava caído na hora da escrita —
nesse segundo caso o par é irrecuperável para sempre. Três desfechos possíveis:

- **(a) 503 de novo, marca fixa.** Passados `graceDeferredAt + 30s`, cascata como sempre.
  Bounded: a detecção atrasa no máximo 30 s. Réplica presa que insista por mais de 30 s cai.
- **(b) 503 de novo, marca renova a cada 503.** Nunca cascateia enquanto o cliente retentar —
  mas um ladrão que retente a cada 29 s nunca é detectado.
- **(c) 401 sem cascata depois da marca.** O retardatário faz re-login sozinho; roubo nesse ramo
  nunca é detectado — o dono não fica sabendo.

**Decidido: (a).** É a única que mantém a cascata como destino final de toda reapresentação sem
par — só adia. A (b) cria um ramo em que quem controla o ritmo adia a detecção
indefinidamente; a (c) troca um falso positivo por um falso negativo silencioso, que é a troca
que a 10.7 recusou.

### Sobre o teto de saltos, para quem perguntar de novo

A fronteira de segurança é a **janela**, não o teto: quem reapresenta um token dentro dos 10 s já
recebe a ponta viva em `hops=0` com qualquer teto. O teto só muda o caso da rajada (corrente mais
longa que o teto dentro da janela): com teto baixo, cascata; com teto alto, ponta viva. Nenhum
teto estende tempo (cada chave morre 10 s depois da própria escrita), serve elo gasto (cada elo é
conferido no banco) ou permite ao atacante alongar a corrente (só rotação legítima cria elo). O
teto precisa existir para limitar o trabalho por requisição — duas idas por salto —, e é só isso.

## Critérios

- [ ] `Session` ganha `graceDeferredAt DateTime? @map("grace_deferred_at")`, com migration via
      `npm run db:migrate`.
- [ ] A duração da marca é constante nomeada em `auth.constants.ts`
      (`REFRESH_GRACE_DEFERRED_WINDOW_MS = 30 * 1000`), **não** env var, pelo mesmo racional dos
      10 s: número que ninguém deve ajustar em produção sem pensar não merece um botão. O
      comentário diz o que ela cobre: a retentativa imediata do guia mais uns poucos passos de
      backoff.
- [ ] No ramo de 503 do `refresh` (`MISS` e `UNAVAILABLE`), a marca é gravada **antes** do
      `throw`, **só se ainda não existir** (regra (a): marca fixa, não renova). A escrita passa
      pelo repository, como toda ida ao Prisma.
- [ ] `graceApplies` passa a ser: elo não invalidado, não expirado, **e** (`usedAt + 10s > agora`
      **ou** `graceDeferredAt + 30s > agora`). Fora das duas janelas, cascata como sempre.
- [ ] A marca **não** abre a graça para elo explicitamente morto — logout, ban, reset de senha,
      cascata anterior — exatamente como a janela de 10 s já não abre. A guarda de
      `invalidatedAt`/`expiresAt` continua na frente.
- [ ] Testes na fronteira HTTP, sem injeção de relógio, posicionando `usedAt`/`graceDeferredAt`
      direto do teste, no padrão dos da 10.7/10.15:
      - 503 dentro da janela grava a marca;
      - reapresentação com `usedAt` fora dos 10 s **e** marca dentro dos 30 s: com par no cache,
        serve a ponta viva; sem par, 503 de novo, **nenhuma sessão morre**, e a marca **não** é
        renovada;
      - reapresentação com `usedAt` fora dos 10 s e marca fora dos 30 s: cascata;
      - elo invalidado com marca dentro dos 30 s: 401, sem servir nada.
- [ ] A mensagem do 503 (`action`) para de dizer "em alguns instantes" e passa a dizer para
      tentar de novo **agora** — hoje ela contradiz o guia, e quem obedece à mensagem provoca o
      caminho 1.
- [ ] `docs/context/identity-and-sessions.md`, na seção da janela de graça: a marca, a sub-regra
      (a) e os dois caminhos recusados; o teto em 5 e o caminho 2 como **exposição aceita**, com
      o parágrafo do "para quem perguntar de novo" destilado.
- [ ] `docs/guides/integrating-with-the-api.md`: o bullet do 503 passa a dizer que a retentativa
      tem uma janela própria (30 s a partir do primeiro 503) e que, passada ela, a reapresentação
      é indistinguível de roubo. O OpenAPI do `/auth/refresh` não muda de status — só de texto,
      se a descrição do 503 citar os 10 s.
- [ ] Caso novo em `tests/integration/v1/mass-assignment.test.ts` **não** se aplica: nenhum
      schema de escrita novo.
- [ ] Suíte completa, `typecheck`, `lint` e `docs:check` verdes.

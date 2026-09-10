# 18: Os dois caminhos em que a cascata ainda dispara sem roubo

**What to build:** uma decisão. A janela de graça (10.7) e a caminhada pela corrente (10.15)
tiraram a cascata do caminho da concorrência comum. Sobraram dois caminhos em que ela dispara sem
ninguém ter roubado nada. Os dois são estreitos. Os dois têm o mesmo sintoma máximo: o dono da
conta sai de todos os dispositivos.

**1. A retentativa do 503 que chega depois de a janela fechar.** Dentro da janela, sem par para
reproduzir, a API responde 503 e diz "tente de novo" — e o guia de integração diz o mesmo. Se a
retentativa chegar depois de `usedAt + 10s`, ela cai no ramo de roubo: 401 e cascata. O 503 promete
ser retentável exatamente no ramo em que a promessa pode não valer. Hoje o guia manda retentar
**imediatamente** e avisa disso, o que reduz a exposição sem removê-la. Detalhe que estreita mais:
o TTL do Redis começa a contar **antes** de `usedAt` ser gravado, então a chave costuma morrer um
pouco antes da janela do banco — na direção segura (503, não cascata).

**2. O cliente que passa do teto de saltos.** Mais de `REFRESH_GRACE_MAX_CHAIN_HOPS` rotações
dentro dos dez segundos, e o retardatário cai no caminho de sempre — cascata. Exige um cliente
patológico, e o teto pode subir de graça, mas subir o teto move a fronteira em vez de removê-la.

**Blocked by:** None. Nada aqui é regressão: os dois caminhos são estritamente melhores do que o
que existia antes da 10.7, quando **toda** reapresentação cascateava.

**Status:** needs-info

**Triagem:** needs-info — a pergunta é de negócio: a API pode cascatear quando não tem certeza?

## A pergunta

Hoje a regra é "sem certeza de que é concorrência → trata como roubo", com a janela e a corrente
comprando certeza onde é barato. A alternativa é inverter nas pontas: "sem certeza → não decide"
(503), e cascatear só com evidência positiva de reuso fora de qualquer janela.

Inverter custa detecção: um token roubado e reapresentado num momento infeliz ganharia 503 em vez
de derrubar a corrente. Não inverter custa o falso positivo descrito acima.

## Os caminhos

1. **Deixar como está**, com o aviso no guia. Custo zero, exposição conhecida e documentada.
2. **Lembrar o incidente.** No ramo de `MISS` (Redis vivo, chave sumida), gravar uma marca com
   TTL próprio; uma reapresentação que ache a marca recebe 503 outra vez, nunca cascata. Fecha o
   caminho 1 quase todo. Não fecha o ramo de Redis inalcançável, que é justamente onde não há
   onde gravar.
3. **Subir o teto de saltos** (fecha só o caminho 2, e só o move).

**Recomendação: (1) por agora, e (2) se aparecer no audit log.** A metadata `chainHops` da ação
`AUTH_REFRESH_GRACE_SERVED` já diz se a corrente é seguida na prática; um `warn` de "sem ponta
viva" e o volume de 503 dizem se o caminho 1 acontece. Construir (2) antes de medir é adivinhar.

## Critérios (depois de decidido)

- [ ] O caminho escolhido está implementado, ou a decisão de não mexer está registrada em
      `docs/context/identity-and-sessions.md`, na seção da janela de graça.
- [ ] Se algo mudar no que o cliente vê, `docs/guides/integrating-with-the-api.md` muda junto.

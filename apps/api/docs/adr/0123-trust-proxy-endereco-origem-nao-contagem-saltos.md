# `trust proxy` é por endereço de origem, não por contagem de saltos (D7, revisto na 10.2)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Segurança** › *Hardening HTTP*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

O deploy tem proxy reverso na frente, então `req.ip` sem `trust proxy` é o IP do proxy — o mesmo
para todo mundo. Rate limit por IP, `Session.ipAddress` e o `ip` do audit log passariam a
registrar (e limitar) uma origem só, quebrando os três de uma vez, em silêncio.

A primeira forma disso foi `app.set("trust proxy", 1)`: um salto, o proxy que sabemos existir.
**Ela deixou de servir na 10.2**, quando um cliente que renderiza no servidor (o front web) passou
a chamar a API em nome do visitante. A partir daí duas cadeias vivem ao mesmo tempo —
`visitante → nginx → api`, com um salto, e `visitante → nginx → front → api`, com dois — e
**nenhuma contagem única acerta as duas**: `1` grava o container do front, `2` grava o nginx
quando a chamada não passou pelo front. Contar saltos pressupõe uma topologia só. (Na prática há
ainda a borda da Cloudflare na frente do nginx; ela não entra na conta porque o **proxy** resolve
o IP real do visitante a partir de `CF-Connecting-IP` antes de encaminhar — decisão da 10.6, em
[`0160`](0160-api-atende-num-subdominio-apex-fica-limpo.md) § "A API atende num subdomínio, e o apex fica limpo".)

A forma que serve as duas é confiar por **endereço**:

```ts
app.set("trust proxy", ["loopback", "uniquelocal"]);
```

O Express caminha o `X-Forwarded-For` da direita para a esquerda pulando endereços confiáveis e
para no primeiro que não é. Consequência de contrato, deliberada: o cliente pode **copiar** o
header que recebeu ou **acrescentar** o próprio salto, tanto faz — transformar um detalhe de
implementação do cliente em pré-requisito de segurança da API seria acoplamento gratuito. O
contrato do lado do cliente está em
[`guides/integrating-with-the-api.md`](../guides/integrating-with-the-api.md).

**O que torna isso seguro é a porta 3000 não ser publicada no host em produção** (10.2, no
`infra/docker-compose.prod.yml`). Confiar em endereço privado com a porta publicada seria o furo
que `true` sempre foi: qualquer um forjaria o próprio IP e furaria rate limit, lockout e audit log
de uma vez. Sem publicação, uma conexão vinda da internet direto na API não existe — quem alcança
a API por endereço privado é só o nginx e os containers das redes declaradas. As duas mudanças são
**uma decisão só**, e é por isso que republicar a porta "só para depurar" reabre o buraco.

Chamada que **não** é em nome de um visitante (job, health check, script) não manda o header, e aí
o IP registrado é o do próprio cliente — que é o correto.

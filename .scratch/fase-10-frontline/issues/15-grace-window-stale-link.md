# 15: O par cacheado que já foi rotacionado dentro da própria janela

**What to build:** uma decisão, primeiro — código depois. A janela de graça da 10.7 devolve o par
que aquela rotação emitiu. Falta dizer o que ela deve devolver quando esse par **já não é o
atual**.

O caso: o cliente apresenta A, recebe B, e rotaciona B → C ainda dentro dos 10 segundos (um
cliente que renova a cada navegação faz isso). Aí chega um retardatário com A. O cache responde,
e o cliente recebe **B**, que já foi usado. A janela de B começou a contar quando B foi usado, e a
essa altura resta pouco dela: o cliente guarda B, espera os 15 minutos do access token, renova com
B fora da janela — e leva a cascata de roubo, que é o dano exato que a 10.7 existe para evitar.

Exige as duas condições juntas (rotação dupla dentro da janela **e** um retardatário com o token
de dois elos atrás), o que não é o caso comum. Mas o cliente que dispara a rotação dupla é
justamente o cliente com prefetch, que é o público da 10.7.

**Blocked by:** None. A 10.7 está fechada e o comportamento de hoje é o que ela pediu ao pé da
letra.

**Status:** needs-info

**Triagem:** needs-info — o caminho depende de decisão de negócio, não de investigação técnica.

## Os caminhos

1. **Não fazer nada.** O caso pede duas coincidências e a janela é de dez segundos. Ganha:
   simplicidade, nenhum código a mais no caminho quente. Perde: quando acontece, o sintoma é o
   pior possível (deslogar de tudo) e é irreproduzível para quem for depurar.
2. **Seguir a corrente.** No acerto, se o refresh do par cacheado também já foi usado, consultar
   a chave dele e devolver o par seguinte, com um teto de saltos. Ganha: o retardatário recebe o
   par **atual** e converge com o resto do cliente. Perde: um laço com teto arbitrário e uma
   segunda ida ao Redis num caminho que hoje tem uma.
3. **Recusar servir um elo vencido.** No acerto, se o refresh cacheado já foi usado, responder
   503 (o mesmo "não decido" do resto da issue). Ganha: nunca devolve token morto, e é uma
   linha. Perde: o 503 promete ser retentável e aqui a retentativa também falha — a promessa
   fica falsa nesse ramo.

**Recomendação: (2).** É a única que devolve ao cliente um par que ele pode usar, e o teto de
saltos é honesto — a corrente não pode ser mais longa que o número de rotações que cabem em dez
segundos. Mas a escolha entre "converge" e "não complica" é do dono do produto, não minha.

## Critérios (depois de decidido)

- [ ] O caminho escolhido está implementado e comentado com o porquê da recusa dos outros dois.
- [ ] Teste na fronteira HTTP, sem injeção de relógio: A → B → C dentro da janela, e então A de
      novo. Afirma o desfecho escolhido, e afirma que **nenhuma sessão morre** no caminho.
- [ ] A decisão está em `docs/context/identity-and-sessions.md`, na seção da janela de graça.

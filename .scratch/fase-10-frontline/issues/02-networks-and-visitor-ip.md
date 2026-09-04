# 02: Três redes, porta despublicada, e o IP do visitante

**What to build:** o IP de quem visita a loja chega íntegro ao rate limit, ao account lockout e
ao audit log — mesmo quando quem abre a conexão é o container de um cliente que renderiza no
servidor. Hoje todos os visitantes colapsam num IP só, dividem o mesmo balde e envenenam a
trilha de auditoria. Junto, a topologia de rede deixa de ser montada à mão a cada deploy.

As três partes são **uma decisão só** e não podem ser separadas: confiar em endereço privado
só é seguro com a porta despublicada, e fazer uma sem a outra cria um estado intermediário em
que a API confia num header forjável pela internet.

**Blocked by:** 01 (sequenciamento, não dependência lógica: as duas editam o mesmo bloco de
serviço, e fazer esta antes significa escrever o trecho duas vezes).

**Status:** ready-for-agent

- [ ] Três redes declaradas, com papéis distintos: uma interna sem rota para a internet com
      banco, cache e API; uma nomeada e dedicada, compartilhada com clientes internos; e a rede
      externa do reverse proxy, declarada em vez de conectada à mão.
- [ ] Um cliente na rede compartilhada **não** alcança Postgres nem Redis.
- [ ] A porta da API deixa de ser publicada no host em produção; o reverse proxy passa a
      alcançá-la por DNS de container. A variável de porta sobrevive só em dev.
- [ ] A confiança em proxy passa a ser por **endereço de origem**, não por contagem de saltos:

      app.set("trust proxy", ["loopback", "uniquelocal"])

      A contagem não serve porque duas cadeias passam a coexistir — visitante→proxy→API, com um
      salto, e visitante→proxy→cliente→API, com dois — e nenhum número único acerta as duas.
      Por endereço, o framework caminha o header da direita para a esquerda pulando os
      confiáveis e para no primeiro que não é.
- [ ] Consequência de contrato, documentada no guia de integração: o cliente pode **copiar ou
      acrescentar** ao header, tanto faz. Isso é deliberado — transformar um detalhe de
      implementação do cliente em pré-requisito de segurança da API é o acoplamento que este
      item existe para evitar.
- [ ] Teste cobrindo os **três** caminhos (direto, via proxy, via cliente com salto extra),
      afirmando o endereço que a API grava na linha de sessão e no audit log. Sem rota de eco
      criada só para o teste. Erro aqui é silencioso e envenena a trilha sem ninguém perceber.
- [ ] O passo manual `docker network connect` some do procedimento de deploy, e o guia registra
      isso.
- [ ] **Verificação manual:** subir a stack e provar que a porta não responde de fora e que o
      proxy continua alcançando a API.

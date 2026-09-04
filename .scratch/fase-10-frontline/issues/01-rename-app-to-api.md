# 01: Renomear o serviço `app` para `api`

**What to build:** um cliente interno resolve a API pelo nome `api` e a alcança. Hoje o serviço
do Compose se chama `app`, então o DNS da rede publica `app`, e a chamada que o front já tem
escrita falharia em resolução de DNS no primeiro deploy conjunto. O nome do serviço vira alias
de rede automático, então renomear é o que faz o contrato já publicado do outro repo passar a
ser verdade.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] O serviço se chama `api` nos três arquivos de Compose (base, dev, prod) e o container de
      produção se chama `pet-oasis-api`; o de dev acompanha.
- [ ] Um alias de rede explícito `api` é declarado, em vez de depender do comportamento
      implícito do Compose — DNS que falha em silêncio é o modo de falha caro aqui.
- [ ] A variável de porta passa a se chamar `API_PORT`, no arquivo de exemplo de ambiente e em
      todo consumidor.
- [ ] **Não** são renomeados: o diretório de trabalho dentro do container, os caminhos internos
      montados, e a variável que guarda a URL pública do cliente. Confundir esses três é o jeito
      de quebrar os bind mounts e os emails.
- [ ] Os três arquivos de serviço systemd apontam para o container novo.
- [ ] O procedimento de remover as units antigas e instalar as novas está escrito no README de
      agendamento, com a ordem (reinstalar **antes** do deploy que renomeia) e um passo de
      execução manual de verificação.
- [ ] Guia de deploy e README mencionam o nome novo; uma varredura prova que nenhuma menção ao
      nome antigo sobrou fora de prosa histórica.
- [ ] **Verificação manual** (não há teste automatizado — isto vive no Docker): subir a stack de
      produção e provar de outro container na mesma rede que `api` resolve e responde.

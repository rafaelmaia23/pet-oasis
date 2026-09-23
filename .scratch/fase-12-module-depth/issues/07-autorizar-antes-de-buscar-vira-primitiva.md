# 07: Autorizar-antes-de-buscar vira primitiva, e o caminho invertido sai

**What to build:** a invariante de segurança "autorize, depois carregue" passa a ser impossível de
errar num call site novo. Hoje ela é hábito: cada serviço reescreve o 403 com o nome da feature
digitado em prosa e depois o carrega-ou-404 — e um caminho faz o inverso, buscando antes de
autorizar, que é exatamente o vazamento que o ADR proíbe (quem não tem a feature `:others`
descobriria se um id existe). Esse caminho tem zero callers e zero testes: um guard que ninguém
alcança é um guard cujo erro ninguém viu.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Uma primitiva que recebe o actor, a feature e o id do alvo, ordena autorização e carga
      internamente, e devolve o alvo carregado
- [ ] O `action` do 403 é derivado da feature recebida, não digitado em cada site
- [ ] O modo *fail-closed* de pet (o dono não está na URL) é um **modo nomeado** da mesma primitiva,
      não um par de helpers próprio
- [ ] Escopo: usuário, pet e perfil. Os resolvedores do catálogo **ficam como estão** — são
      carrega-ou-404 puros, autorizados pelo guard da rota, e não têm o hazard de ordem
- [ ] O caminho que busca antes de autorizar é **removido**
- [ ] A construção da descrição de features do 403, hoje duplicada entre o guard de rota e um
      serviço, volta a ter um dono
- [ ] Teste unitário de que 403 vence 404, e do modo fail-closed
- [ ] Os casos de integração existentes de 403-antes-de-404 seguem verdes, sem remoção

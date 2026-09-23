# 17: A escada de views passa a declarar o par (passo, feature que destrava)

**What to build:** "qual view este viewer recebe" passa a ter um dono. Hoje a escada é declarada no
contrato como um array de schemas e a feature que destrava cada passo é **prosa**; a API restata o
mapa em camadas diferentes por recurso — controller num, serviço noutro, inline num terceiro — e a
mesma função de escolha está duplicada verbatim entre produto e variante. O comentário do próprio
serviço de produto avisa que o filtro da listagem e a view escolhida não podem divergir, e depois
confia nos dois callers lembrarem. O esforço do web precisa do mesmo mapa para decidir afordância, e
seria o quarto lugar a reescrevê-lo.

**Esta issue começa por um ADR**, antes de qualquer código: ela mexe na fronteira que o ADR-0199 da
API desenhou ("quem sabe o que o viewer pode é a API, não o contrato"). O esboço fica do lado certo
dela — o contrato **declara** a correspondência, a API continua **decidindo** —, mas quem lê no
futuro precisa achar o porquê de a fronteira ter se movido um passo.

**Blocked by:** 02 (a contenção da escada é um dos invariantes provados lá).

**Status:** ready-for-agent

- [ ] ADR novo na API registrando a mudança de fronteira, com a linha no índice, **antes** do código
- [ ] A escada passa a declarar pares ordenados (passo, feature que destrava) em vez de só os schemas
- [ ] As funções de escolha de view da API colapsam numa, sobre essa lista; a decisão continua na API
- [ ] A duplicação verbatim entre produto e variante deixa de existir
- [ ] O filtro da listagem e a view escolhida passam a sair da mesma declaração
- [ ] Teste tabelado do mapa feature → passo, que é a parte que vaza dado quando erra
- [ ] Os `*.presenter.ts` **não** são tocados: o ADR-0199 decidiu que ficam
- [ ] Nenhuma view ganha ou perde campo; os testes de integração de vitrine e de usuário seguem
      verdes sem alteração

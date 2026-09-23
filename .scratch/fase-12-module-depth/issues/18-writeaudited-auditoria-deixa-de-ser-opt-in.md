# 18: A auditoria deixa de ser opt-in de quem chama

**What to build:** uma escrita que deve deixar rastro passa a **declarar** o descriptor de auditoria
em vez de recebê-lo como opcional. Hoje trinta e cinco assinaturas de repositório carregam o
descriptor como opcional e treze repetem o mesmo corpo de dois braços — escrita simples quando não
vem descriptor, transação com o registro de auditoria quando vem. A consequência: uma chamada nova
que esquece o argumento grava estado sem rastro, e é indistinguível de um no-audit deliberado.

**Esta issue começa por um ADR**, antes do código: a regra "com transação a falha de auditoria desfaz
a ação; sem transação, não" é depth real e hoje só é alcançável por treze cópias; mover isso mexe em
território que o ADR-0098, o ADR-0099 e o ADR-0100 da API já delimitaram — a escrita transacional é
do repositório, o registro é de lib, e lib não conhece módulo.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] ADR novo na API com a decisão e o lugar do helper, com a linha no índice, **antes** do código
- [ ] Um helper que recebe o descriptor e o trabalho a rodar na transação; o braço duplicado
      desaparece dos treze sites
- [ ] O helper nasce em nível de repositório ou agnóstico de módulo — lib continua sem conhecer módulo
- [ ] Onde a taxonomia de auditoria exige rastro, o descriptor deixa de ser opcional: "sem rastro"
      passa a ser escrito, não omitido
- [ ] Teste da semântica com e sem transação (a falha de auditoria desfaz ou não a ação) num lugar só
- [ ] O que hoje é auditado continua auditado, com o mesmo conteúdo de linha; os testes de auditoria
      seguem verdes sem remoção

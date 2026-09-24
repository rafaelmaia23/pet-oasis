# `writeAudited` colapsa a escrita transacional do audit; o descritor deixa de ser opcional

Treze repositórios repetiam o mesmo corpo de dois braços — escrita simples sem transação quando
`audit` não vinha, `$transaction` com `record(descriptor, tx)` quando vinha —, e outro punhado de
sites já abria a transação sempre mas só chamava `record` `if (audit)`. Em nenhum call site real o
`audit` deixava de vir: a taxonomia fechada de ações (`docs/reference/logging-policy.md` §4.3) já
determina que toda escrita nesses módulos tem uma ação de audit correspondente, então o `?` no tipo
nunca refletia um caso de negócio — só dava a uma chamada nova a chance de esquecer o argumento e
gravar estado sem rastro, indistinguível de um no-audit deliberado.

`writeAudited` (`src/lib/auditLog.ts`, ao lado de `record` — mesmo dono do ADR-0099/ADR-0100: lib
de observabilidade, sem conhecer módulo) recebe um `AuditDescriptor` — ou um
`(result) => AuditDescriptor` quando o descritor depende do que a escrita produziu (o id gerado
pelo banco, uma contagem de cascata) — e a função que roda dentro da `$transaction`; ele abre a
transação, roda o trabalho, grava o audit na mesma transação (a falha desfaz a escrita, regra do
ADR-0098 §4.5) e devolve o resultado. O braço sem transação some porque deixa de existir, nesses
sites, um caso que legitimamente não audita.

Onde a ação de fato não é sempre rastreada — `verificationToken.repository.ts` atende quatro
purposes e só três têm ação na taxonomia — o parâmetro continua opcional e a função continua fora
do escopo do `writeAudited`: o helper é para a escrita de uma ação única e sempre-auditada, não
para infraestrutura genérica que decide caso a caso.

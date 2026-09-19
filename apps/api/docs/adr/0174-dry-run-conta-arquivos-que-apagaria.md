# O `--dry-run` conta os arquivos que apagaria (9.11)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Infraestrutura** › *Seeds e ambiente demo*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

`DemoResetCounts` ganhou `uploadFiles` junto das oito chaves de tabela do catálogo. O dry-run existe
para se olhar antes de apertar o botão, e a partir da 9.11 a operação mais destrutiva do script
passou a ser justamente a que ele não mostrava. Contar dirent é leitura pura, então o contrato
read-only do dry-run continua intacto — e o número entra no `metadata` do `DEMO_RESET_EXECUTED`, que
é onde alguém vai olhar quando a demo amanhecer sem foto. Isso motivou o quinto método da interface
`Storage`, `countFiles(prefix)`: diferente do `exists` recusado acima, ele é chamado três vezes por
reset diário, e a alternativa era `fs.readdir` migrar para dentro do script, que é exatamente o que
o adaptador existe para evitar.

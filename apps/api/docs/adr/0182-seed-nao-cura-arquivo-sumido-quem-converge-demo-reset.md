# O seed não cura arquivo sumido; quem converge é o `demo-reset` (9.11)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Infraestrutura** › *Dataset fake*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Cenário real: o entrypoint de produção roda o seed a cada boot, e ele é idempotente por chave
estável, então pula o produto que já existe — e pula a imagem junto. Se o `UPLOAD_DIR` do host for
recriado vazio (host novo, disco trocado, faxina) enquanto o banco sobrevive, a demo passa a servir
404 em toda foto e nada no log diz por quê.

Aceito conscientemente. A correção "óbvia" seria um `exists(key)` na interface `Storage`, e ela foi
recusada: a interface é a costura para S3/MinIO, e um `exists` por imagem a cada boot vira uma
chamada de rede por imagem no dia em que o backend for remoto. O `demo-reset` roda diariamente por
systemd, trunca e repovoa — a janela é de no máximo um dia num ambiente de portfólio. O
`cleanup-uploads.ts` já reporta "linha sem arquivo" sem apagar, que é o sinal para quem for
investigar.

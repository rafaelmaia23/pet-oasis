# Corpo grande demais é 413

> Decisão migrada em 2026-09-18 do contexto temático da API (**Segurança** › *Hardening HTTP*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Com `express.json({ limit })` ligado, o body-parser lança `entity.too.large`, que ninguém mapeava
— a API respondia **500** a um request que ela mesma recusou de propósito (mesmo tipo de furo do
JSON malformado, corrigido na 4.5). 413 é o status que existe para isso; 400 perderia a distinção
entre "JSON quebrado" e "JSON grande demais", e 422 é para corpo bem-formado com semântica
inválida — aqui o corpo nem chega a ser lido. A mensagem é genérica: não revela o teto configurado.

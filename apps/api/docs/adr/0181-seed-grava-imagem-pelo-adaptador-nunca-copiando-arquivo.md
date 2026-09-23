# O seed grava imagem pelo adaptador, nunca copiando arquivo (9.11)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Infraestrutura** › *Dataset fake*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Tanto o catálogo quanto os pets fake passam por `storeImage` (`src/lib/storage/image.ts`), o mesmo
caminho que a API usa: magic bytes, `sharp`, dois derivados WebP, EXIF descartado. Copiar o arquivo
para dentro do `UPLOAD_DIR` seria mais rápido e produziria arquivo com **forma diferente** da que o
endpoint produz — e o descasamento só apareceria na demo.

# Não existe script para apagar o banco de produção (10.5)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Infraestrutura** › *Imagem e boot de produção*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Provar que o boot está limpo exige um banco **vazio**: com o banco já migrado, o `migrate deploy`
só lê a tabela de migrations e responde "nada pendente", sem exercitar a engine. O caminho é
apagar o volume com `docker compose ... down -v`, e a simetria com o `dev:reset` sugeriria um
`prod:reset` no `package.json`.

Ele não existe, e é decisão: **apagar produção é ato deliberado, digitado à mão**. Um script de
nome amigável encostado no `prod:up` na mesma lista transforma perda total de dados em erro de
digitação. O atrito de escrever o comando inteiro — com `-p`, `--env-file` e os dois `-f` — é
proteção barata, e a operação acontece uma vez por issue de infra, não todo dia. O comando está
escrito no roteiro de verificação da issue que precisou dele, não no `package.json`.

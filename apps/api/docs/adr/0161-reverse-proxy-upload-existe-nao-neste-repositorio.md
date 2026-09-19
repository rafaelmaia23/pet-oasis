# O reverse proxy do upload existe, mas não neste repositório (9.10)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Infraestrutura** › *Imagem e boot de produção*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

`GET /uploads/*` é servido pelo **próprio Node** (`express.static`, em `src/app.ts`), e não pelo
reverse proxy que o [ADR de upload](0010-file-storage-and-uploads.md) pressupunha. O motivo é
factual: não há proxy nenhum versionado aqui. O nginx existe no servidor pessoal que hospeda a
demo de portfólio, e a configuração dele vive fora do git — este repositório só **declara** a rede
por onde ele alcança a API (10.2, acima).

Servir por Node é o que mantém **um caminho só** nos três ambientes. A alternativa — Node em dev,
nginx em produção — fabricaria a classe de bug "funciona na minha máquina, 404 no deploy", num
ponto em que o sintoma (imagem quebrada) não aponta para a causa.

O que mantém a porta aberta é o volume ser **bind mount** e não volume nomeado: o arquivo fica
visível no filesystem do host, e o dia em que o tráfego justificar, a mudança inteira é um
`location /uploads/ { alias ...; }` no nginx mais um `UPLOAD_PUBLIC_BASE_URL` novo. Nada gravado
no banco muda — ele guarda a **chave**, nunca a URL. De brinde, backup de imagem vira `rsync` de
um diretório em vez de arqueologia em `/var/lib/docker/volumes`.

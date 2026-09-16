# 06: Subdomínio da API (`pet-oasis-api.maiahub.com.br`) e base de URL das imagens

**What to build:** a API passa a atender em **`pet-oasis-api.maiahub.com.br`**, as imagens passam
a ser servidas por esse host, e o apex (`pet-oasis.maiahub.com.br`) fica livre para o front —
**sem redirect nenhum** do apex para a API. A parte do servidor é do operador; a parte do
repositório é reescrever tudo que foi escrito para o nome anterior (`api.pet-oasis.maiahub.com.br`)
e para uma receita de nginx/certbot/301 que não corresponde ao servidor real.

**Blocked by:** nada. A 02 (rede `proxy`, porta despublicada) já está mergeada, e é o que o proxy
host do NPM precisa.

**Status:** ready-for-agent

**Triagem:** ready-for-agent — as três decisões que esta issue precisava estão tomadas (abaixo);
o que resta no repositório é reescrita de documentação e apontadores, sem regra de negócio nova.
A parte do servidor está listada à parte, para o operador, e a verificação final fecha a issue.

## Decisões (usuário, 2026-09-16)

1. **O nome muda para `pet-oasis-api.maiahub.com.br`** (primeiro nível sob `maiahub.com.br`),
   em vez de `api.pet-oasis.maiahub.com.br` (segundo nível). Motivo: os registros DNS deste
   host são **proxiados pela Cloudflare**, e o Universal SSL dela cobre só o apex e
   `*.maiahub.com.br` — um nome de segundo nível não tem certificado na borda e falha no
   handshake TLS (`alert handshake failure`, verificado de fora em 2026-09-16). As alternativas
   descartadas: registro em DNS only (perde o proxy da Cloudflare só nesse host) e Advanced
   Certificate Manager (pago). Trocar o nome custa retrabalho de apontadores, e foi o escolhido.
2. **Nenhum 301 no apex.** A demo era quase não divulgada; o apex vai direto para o front. Os
   dois redirects (`/reference`, `/openapi.json`) que a versão anterior desta issue prometia
   **não existem** e não vão existir. Quem tinha o link antigo troca a base.
3. **O reverse proxy é o Nginx Proxy Manager, com certificado por desafio DNS na Cloudflare** —
   não nginx cru com `certbot --nginx` e HTTP-01, como o `deploy.md` descreve hoje. O guia
   documenta a **forma** da configuração (continua fora do repositório), mas a forma certa.

Contexto que vale registrar em lugar permanente, porque muda a cadeia de IP da 10.2: com o proxy
da Cloudflare ligado, quem abre a conexão no NPM é a borda da Cloudflare. O NPM anexa o
`$remote_addr` dele ao `X-Forwarded-For` (`$proxy_add_x_forwarded_for`); sem tratamento, a API
receberia `visitante, ip-da-cloudflare`, e o `trust proxy ["loopback","uniquelocal"]` pararia no
IP da Cloudflare — todos os visitantes num balde só, o problema exato que a 10.2 resolveu. A
correção é no proxy host do NPM: `real_ip_header CF-Connecting-IP; real_ip_recursive off;`. O
NPM já traz `set_real_ip_from` com as faixas da Cloudflare (`ip_ranges.conf`, baixado no boot),
então `$remote_addr` vira o visitante e a API recebe `visitante, visitante` — e pega o visitante.
`recursive off` porque `CF-Connecting-IP` é um endereço, não uma lista. A configuração vale para
**todo** proxy host que receba visitante da Cloudflare — o da API e, quando o front subir, o do
apex (cadeia `visitante → Cloudflare → NPM → front → api`).

## O que muda no repositório (trabalho de agente)

Levantado com `grep -rn "api\.pet-oasis\.maiahub"` e `grep -rn -i "301\|certbot\|server block"`
em 2026-09-16. Fora daqui, o worktree `.claude/worktrees/` da issue 10 tem cópias dos mesmos
arquivos — **não** é para editar lá.

**Troca de host (`api.pet-oasis.` → `pet-oasis-api.`), mecânica:**

- `README.md` — linhas 18, 43, 47, 48, 49, 68, 82, 123, 209.
- `api-collection/environments/prod.bru` — `baseUrl`.
- `.env.example:193` — exemplo de `UPLOAD_PUBLIC_BASE_URL`.
- `docs/guides/integrating-with-the-api.md:59` — a base pública.
- `docs/guides/deploy.md:30` — exemplo de `UPLOAD_PUBLIC_BASE_URL`.
- `docs/context/infrastructure.md:241` e `docs/context.md:318` (a linha do índice).
- `docs/reference/backlog.md:240` (título do item) e `:248`, `:252`.

**Remoção do 301 e da receita nginx/certbot, narrando a reversão (não errata):**

- `README.md:43` — a frase "O apex redireciona `/reference` e `/openapi.json` para cá com 301"
  sai; fica só "a API está no ar em `pet-oasis-api.maiahub.com.br`".
- `docs/guides/deploy.md` § "Domínio e reverse proxy" (linhas 107–213), reescrita inteira:
  - some a tabela dos dois 301 e o parágrafo "São só esses dois";
  - some "A ordem, que não é livre" (é a ordem do `certbot --nginx` + HTTP-01, que não é o que
    o servidor faz) e "A forma final" (os dois server blocks crus);
  - entra a forma **real**: proxy host no NPM com forward para `pet-oasis-api` porta `3000`
    (por DNS de container — o NPM precisa estar na rede `proxy`, `docker network inspect proxy`),
    certificado Let's Encrypt por desafio DNS na Cloudflare, o bloco custom
    `real_ip_header CF-Connecting-IP; real_ip_recursive off;` com o porquê resumido (o parágrafo
    de contexto acima), e a observação de que o redirect da raiz para `/reference` é do NPM,
    não da aplicação (a API não tem rota `/`). O que o `server` cru equivalente teria
    (`proxy_pass http://api:3000` e os quatro `proxy_set_header`) pode ficar como referência
    curta, porque é o que o NPM gera — mas sem certbot e sem os `location` de 301;
  - o aviso "NUNCA `127.0.0.1:3000`" fica: a porta não é publicada, e é isso que torna seguro o
    `trust proxy` por endereço privado;
  - "Verificar" perde as duas linhas de 301 e troca o host nas outras; ganha uma linha que prove
    a cadeia de IP pela Cloudflare (um login recusado vindo de fora grava em `audit_logs` o IP do
    visitante, não `2606:4700::`/`104.x`/`172.x`).
- `docs/context/infrastructure.md` § "A API atende num subdomínio, e o apex guarda dois 301
  (10.6)": título e corpo reescritos — o apex é do front e **fica limpo**; o parágrafo dos 301
  vira a narrativa de que eles foram planejados e descartados (demo quase não divulgada, e o
  custo de manter dois `location` para sempre num host que não é da API); entra o parágrafo do
  nome (segundo nível não fecha TLS atrás do proxy da Cloudflare — por isso primeiro nível) e o
  da cadeia de IP com `CF-Connecting-IP`, ligado à decisão da 10.2 (que hoje só fala em
  `visitante → nginx → api`, sem a Cloudflare na frente). "A ordem é parte da decisão" perde a
  menção aos 301. O ponteiro para o `deploy.md` fica.
- `docs/context.md:318-320` — a linha do índice acompanha o título novo e perde o "continuam
  chegando por 301".
- `docs/context/security.md:157-158` e `docs/guides/integrating-with-the-api.md:89-94` — as
  cadeias `visitante → nginx → api` ganham a Cloudflare na frente, ou uma frase dizendo que o
  proxy resolve o IP real antes de encaminhar. Só o necessário para a descrição não mentir; a
  decisão em si mora em `infrastructure.md`.
- `docs/reference/backlog.md:240-272` — o item "Apex passa a ser o front; API migra para…" é
  reescrito com o host novo, o bullet "**301 no apex**" narrado como descartado, e o bullet
  "**nginx**: server block novo … certificado com o SAN novo" trocado por NPM + desafio DNS.
- `docs/todo.md` — a linha da 06 na lista de abertas (hoje diz "DNS, certbot, server blocks").

**O que não muda, de propósito:** `APP_URL` (é da 14, e a 14 fechou por decisão do usuário —
já está no apex no servidor); `src/docs/openapi.ts` (`servers` relativo segue o host); o banco
(guarda a chave, não a URL); `infra/docker-compose.prod.yml` (o nome do serviço/container é da
01 e não depende do host público).

## Critérios

- [ ] Nenhuma ocorrência de `api.pet-oasis.maiahub` fora de `.scratch/` (o histórico das issues
      pode manter).
- [ ] Nenhuma menção a 301 do apex, `certbot`, HTTP-01 ou server block cru fora de `.scratch/`
      — `grep -rn -i "301\|certbot\|server block" docs/ README.md .env.example` limpo, exceto
      onde "nginx" é o nome genérico do reverse proxy (essas ficam).
- [ ] `docs/context/infrastructure.md` narra as três decisões acima como reescrita da 10.6
      (não como decisão nova + errata), e a cadeia de IP com Cloudflare está ligada à 10.2.
- [ ] `deploy.md` § "Domínio e reverse proxy" descreve o NPM + desafio DNS + `CF-Connecting-IP`,
      com o roteiro *Verificar* apontando para o host novo e sem 301.
- [x] **Sem migration:** o banco guarda a chave do arquivo, nunca a URL — trocar a variável
      basta. A decisão do ADR de armazenamento paga dividendo aqui.
- [x] **Sem mudança na especificação:** o campo de servidores é relativo e segue o host que
      serve o documento.
- [ ] `npm run docs:check`, `lint`, `typecheck` verdes (nenhuma linha de aplicação muda — a
      suíte não é afetada).
- [ ] **Verificação manual (depois do deploy)**, registrada aqui no formato da 02: TLS válido no
      host novo (`curl -w '%{http_code} %{ssl_verify_result}'` → `200 0`), uma imagem do
      catálogo servida pelo host novo, e um login recusado de fora gravando em `audit_logs` o IP
      do visitante (prova da cadeia pela Cloudflare).

## No servidor (operador)

Feito em 2026-09-16, ainda com o nome anterior — a ser **refeito para `pet-oasis-api.maiahub.com.br`**:

- [ ] Registro `A` de `pet-oasis-api.maiahub.com.br` na Cloudflare (proxiado, como os demais).
- [ ] Certificado Let's Encrypt por desafio DNS para o nome novo.
- [ ] Proxy host no NPM: `pet-oasis-api.maiahub.com.br → pet-oasis-api:3000`, redirect da raiz
      para `/reference`, custom config `real_ip_header CF-Connecting-IP; real_ip_recursive off;`.
      O NPM na rede docker `proxy`.
- [ ] `UPLOAD_PUBLIC_BASE_URL=https://pet-oasis-api.maiahub.com.br/uploads` no `.env.production`
      (hoje está com o host anterior).
- [ ] O registro/proxy host de `api.pet-oasis.maiahub.com.br` pode ser removido — não há link
      publicado para ele; nunca chegou a responder.

O `prod:up` que faz o container `pet-oasis-api` existir vem com o merge da fase (junto da 20 e da
ponta a ponta da 04); até lá o proxy host aponta para um nome que não resolve, o que é esperado.

## Histórico

- **2026-09-06** — primeira versão mergeada no repositório com o nome `api.pet-oasis.maiahub.com.br`,
  os dois 301 no apex e a receita `certbot --nginx` + server blocks crus em `deploy.md`
  (merge `36b2c32`). README, Bruno, `.env.example`, `deploy.md`, `infrastructure.md` e o índice
  passaram a apontar para lá.
- **2026-09-16** — o operador executou DNS, certificado (desafio DNS Cloudflare) e proxy host no
  NPM para o nome antigo; a verificação de fora achou o handshake TLS falhando por ser nome de
  segundo nível atrás do proxy da Cloudflare. Na mesma data: 301 descartados, nome trocado para
  `pet-oasis-api.maiahub.com.br`, e esta issue reescrita como retrabalho de agente.

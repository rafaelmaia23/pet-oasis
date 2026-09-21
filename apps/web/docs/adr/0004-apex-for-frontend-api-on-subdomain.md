# O apex passa a servir o front; a API vai para um subdomínio

> Revisto em 2026-09-19 contra o guia de integração e o ADR 0160 da API: o nome do
> subdomínio, o dono da rede compartilhada e os 301 mudaram do lado dela. Revisto de novo em
> 2026-09-21, no import para o monorepo: a rede entre o front e a API deixou de ser externa e
> passou a ser do stack Compose único da raiz.

`pet-oasis.maiahub.com.br` servia a API, redirecionando a raiz para a referência Scalar.
Passa a servir este front, e a API migra para **`pet-oasis-api.maiahub.com.br`**. O motivo é
de portfólio, não técnico: peça visual chama mais atenção do que UI de documentação de API.
O nome é de primeiro nível por correção da API (ADR 0160 dela): a primeira escolha,
`api.pet-oasis.maiahub.com.br`, não tem certificado na borda da Cloudflare, cujo Universal
SSL cobre só o apex e `*.maiahub.com.br`.

Os dois rodam em containers Docker separados no mesmo VPS, numa rede dedicada entre eles
(`frontend`, do stack Compose único da raiz — `infra/docker-compose.prod.yml`). Enquanto
eram dois repositórios, essa rede era a `pet-oasis`, **criada uma vez no host, fora dos
dois** — rede que liga stacks diferentes vive mais que qualquer um deles; com os dois
serviços no mesmo stack, a rede é dele: nasce no `up`, morre no `down`, e "o up do web
falhou porque a rede da API não existe" deixou de ser possível por construção. Toda chamada
que o front faz no servidor vai por essa **rede interna** (`http://api:3000/api/v1`), nunca
pela URL pública — sem TLS, sem sair do host. Apenas as URLs de imagem são públicas, porque
quem as carrega é o navegador.

## Consequences

- **Sem 301 no apex.** A primeira versão prometia redirecionar `/reference` e `/openapi.json`
  para que link publicado não morresse; a API descartou (a demo era pouco divulgada, e o custo
  era manter dois `location` para sempre num host que não é dela). O apex vai direto para o
  front; quem tinha o link antigo troca a base.
- **O front deixa de publicar porta no host e passa a viver em duas redes**: `frontend`, para
  alcançar a API server-side, e `proxy`, para ser alcançado pelo nginx por DNS de container
  (`pet-oasis-web`). É a mesma topologia da API, pelo mesmo motivo: enquanto houver porta
  publicada existe um caminho até a aplicação que desvia do TLS e do rate limit da frente.
  Só a `proxy` é externa (o nginx não é versionado aqui); a outra é do stack. O que fica é
  a independência entre os dois serviços: o `web` não declara `depends_on: api` — o front
  sobe com a API fora e vice-versa, e o que falha nesse caso é a chamada, não o `up`. (E
  `up --build web` construiria as dependências declaradas, o que faria o deploy só do web
  reconstruir a API por arrasto.)
- **`APP_URL` da API passa a apontar para o front**, e é ela que monta os links de quatro
  emails. Virar `APP_URL` antes de o front ter `/verify-email`, `/reset-password`,
  `/confirm-email-change` e `/confirm-account-reactivation` transforma verificação de conta
  e reset de senha em 404. A ordem correta é: subdomínio e redirects primeiro, `APP_URL`
  só no deploy da fatia 1a.
- **Renomear qualquer uma dessas quatro rotas quebra o email correspondente** sem erro
  visível em lugar nenhum. São contrato, não escolha nossa.
- **O rate limit por IP da API passa a depender do front.** Renderizando a vitrine no
  servidor, quem abre a conexão é o container do front: sem repasse, todos os visitantes
  colapsam num IP só e o site inteiro divide o balde `catalog-read` (300 req / 15 min) — e o
  audit log da API registra o IP errado em toda linha. ISR esconderia a maior parte do
  problema, mas não a busca, cuja cardinalidade de filtros gera cache miss constante. Daí o
  contrato: **toda chamada feita em nome de um visitante repassa o `X-Forwarded-For`**;
  chamada que não é de visitante (job, health check) não manda o header, e aí o IP correto é
  mesmo o do container. A API confia por **endereço de origem**, não por contagem de saltos,
  então copiar o header recebido ou acrescentar o próprio salto dá no mesmo — o front não
  precisa acertar formato nenhum. Detalhe em `integrating-with-the-api.md`, do lado da API.
- **Nenhuma migration para as imagens**: o banco da API guarda a chave do arquivo, nunca a
  URL completa (ADR `file-storage-and-uploads.md`), então trocar `UPLOAD_PUBLIC_BASE_URL`
  basta. E a spec não muda: `servers` é relativo (`/api/v1`).

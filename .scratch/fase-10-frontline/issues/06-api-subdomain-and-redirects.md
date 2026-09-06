# 06: Subdomínio da API, redirects do apex e base de URL das imagens

**What to build:** a API passa a atender em `api.pet-oasis.maiahub.com.br`, e quem seguir um
link publicado do apex para a documentação chega lá por 301 em vez de morrer num 404. As
imagens passam a ser servidas pelo host novo. O apex fica livre para o front, mas **esta issue
não vira a chave** — isso é a 14.

**Blocked by:** 02 (o proxy passa a alcançar a API por DNS de container, e é a 02 que estabelece
isso).

**Status:** ready-for-agent

- [ ] Server block novo para o subdomínio, com certificado cobrindo o nome novo.
- [ ] 301 do apex para a referência interativa e para o documento de especificação, apontando ao
      subdomínio. README, badges e a demo divulgam o apex, e link publicado não deve morrer.
- [ ] A variável de base pública das imagens aponta para o subdomínio.
- [x] **Sem migration:** o banco guarda a chave do arquivo, nunca a URL — trocar a variável
      basta. A decisão do ADR de armazenamento paga dividendo aqui.
- [x] **Sem mudança na especificação:** o campo de servidores é relativo e segue o host que
      serve o documento.
- [x] A variável que guarda a URL pública do cliente **não** é alterada nesta issue.
- [x] README, badges e guia de deploy atualizados.
- [ ] **Verificação manual:** provar que o subdomínio serve a API com TLS válido, e que os dois
      caminhos publicados do apex redirecionam.

---

## Feito no repositório

O que este repositório podia entregar está entregue; o que falta é execução no servidor, e está
marcado abaixo.

- **README**: o botão do topo, a tabela de links, os dois `BASE=` dos roteiros de terminal e o
  ponteiro para o `/openapi.json` no fim passaram a apontar para `api.pet-oasis.maiahub.com.br`.
  A linha "A API está no ar em…" foi reescrita e agora anuncia o subdomínio e o 301 do apex.
- **Coleção Bruno** (`api-collection/environments/prod.bru`): a `baseUrl` do ambiente de produção
  também apontava para o apex e teria morrido na virada da issue 14. É apontador nosso, da mesma
  classe do README.
- **`.env.example`**: `UPLOAD_PUBLIC_BASE_URL` ganhou o valor de produção no host da API e o
  motivo (quem serve o byte é a API, é o certificado dela que cobre o endereço); `APP_URL` ganhou
  a distinção explícita entre o host do front e o da API — apontá-la para a API é 404 no link de
  verificação.
- **`docs/guides/deploy.md`**: seção nova *Domínio e reverse proxy*, com a tabela dos dois 301, o
  server block do subdomínio e o do apex, o `certbot` com os dois nomes, o aviso de que o registro
  DNS precisa existir antes da validação, e o roteiro de verificação. A nota de fecho deixou de
  dizer que o reverse proxy está "fora do escopo" — ele está fora do *repositório*, e agora tem a
  forma escrita.
- **`docs/context/infrastructure.md`** + índice: o *porquê* permanente — apex é do front por valor
  de vitrine, o apex guarda os 301 porque link publicado não morre, imagem sem migration e spec
  sem mudança como dividendo de decisão antiga, e a ordem (`APP_URL` só depois do front).

`typecheck`, `lint` e `docs:check` verdes. Nenhuma linha de aplicação mudou — a suíte não é
afetada por esta issue.

## Falta no servidor (não dá para fazer daqui)

1. Registro `A` de `api.pet-oasis.maiahub.com.br`.
2. `certbot` com os dois nomes, e os dois server blocks do `deploy.md`.
3. `UPLOAD_PUBLIC_BASE_URL=https://api.pet-oasis.maiahub.com.br/uploads` no `.env.production`
   **do servidor**, e `npm run prod:up`. (O `.env.production` desta máquina é um template com
   `APP_URL=https://SEU-DOMINIO` e sem a variável de upload — não é o arquivo que a produção usa.)
4. A verificação manual do roteiro em `deploy.md` § "Domínio e reverse proxy" → *Verificar*, com
   o resultado registrado aqui, no formato da issue 02.

Enquanto (4) não estiver registrado, a issue não fecha e o contador de progresso da fase em
`docs/todo.md` não sobe.

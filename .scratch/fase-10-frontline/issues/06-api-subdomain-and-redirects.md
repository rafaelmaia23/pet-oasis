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
- [ ] **Sem migration:** o banco guarda a chave do arquivo, nunca a URL — trocar a variável
      basta. A decisão do ADR de armazenamento paga dividendo aqui.
- [ ] **Sem mudança na especificação:** o campo de servidores é relativo e segue o host que
      serve o documento.
- [ ] A variável que guarda a URL pública do cliente **não** é alterada nesta issue.
- [ ] README, badges e guia de deploy atualizados.
- [ ] **Verificação manual:** provar que o subdomínio serve a API com TLS válido, e que os dois
      caminhos publicados do apex redirecionam.

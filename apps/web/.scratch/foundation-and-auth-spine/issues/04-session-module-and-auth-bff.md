# 04: Módulo de sessão e BFF de autenticação

**What to build:** a capacidade de criar, ler e destruir uma sessão, e os endereços próprios
do front que fazem o proxy da autenticação. O navegador nunca fala com a API para autenticar,
e os tokens nunca chegam ao JavaScript da página.

Este ticket **não tem interface**. Ele é verificável pela costura 2, não demoável. A tela
que o usa é o ticket 05.

A rotação proativa **não** entra aqui: `ensureFreshSession` existe com a assinatura final,
mas devolve a sessão inalterada. O comportamento de renovação é o ticket 07 — expandir
primeiro, implementar depois.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Módulo de sessão com a interface acordada: criar, ler, destruir e garantir sessão fresca
- [ ] **Relógio e cliente da API entram por injeção.** Nenhuma dependência global dentro do
      módulo — é o que torna a costura 2 possível
- [ ] Sessão persistida em cookie `httpOnly` **criptografado**, do domínio do front
- [ ] O cookie contém apenas os tokens e o identificador do `User`. A **capability efetiva**
      nunca é persistida
- [ ] Endereços próprios do front para entrar e sair, proxiando a API
- [ ] Sair encerra a sessão **também no servidor da API**, não apenas apaga o cookie
- [ ] Credencial recusada devolve a condição que a API informou, sem inventar mensagem própria
- [ ] Testes na costura 2 cobrem criar, ler, destruir e o conteúdo do cookie
- [ ] Um teste prova que a capability efetiva não está no cookie
- [ ] Nenhum teste afirma sobre a estrutura interna do módulo

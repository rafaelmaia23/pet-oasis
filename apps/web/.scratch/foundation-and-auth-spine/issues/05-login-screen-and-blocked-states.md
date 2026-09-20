# 05: Tela de login, saída e os quatro estados que travam a entrada

**What to build:** uma pessoa entra e sai da aplicação. E quando ela **não consegue** entrar,
a tela diz por quê e qual é o caminho de volta — em vez de responder "credenciais inválidas"
para tudo.

Nasce aqui o composto `FormField`, primeiro caso de uso real de formulário do projeto.

Os quatro estados vivem nesta tela porque a API recusa a entrada em **todos** eles: quem está
pendente, banido, com troca de senha forçada ou travado por tentativas **nunca alcança** o
interior da aplicação, então o aviso de verificação e a ação de reenviar precisam existir aqui.

Cada estado tem um `code` estável no envelope de erro, e é por ele que a tela ramifica —
**nunca** pela `message`, que é prosa em pt-BR do lado da API: muitas tentativas é `429`
(`TOO_MANY_REQUESTS`, com o tempo de espera no `Retry-After`) — e é **um só `code`** para o
lockout da conta e para o rate limit por IP, então a tela não afirma qual dos dois foi;
banida, troca forçada e não verificada são `403` (`ACCOUNT_BANNED`, `PASSWORD_RESET_REQUIRED`,
`EMAIL_NOT_VERIFIED`); credencial errada é `401` (`UNAUTHORIZED`). Os `code` vêm de
`ERROR_CODES` do contrato, nunca de string solta.

Sobre os dados de teste: o seed da API já cria usuários **banidos** e **pendentes**. O estado
de troca de senha forçada é produzido no preparo do teste, por um administrador semeado. O
lockout é produzido por tentativas repetidas — e o teste **não** pode usar a conta isenta de
lockout.

**Blocked by:** 00, 02, 04

**Status:** ready-for-agent

- [ ] Formulário de login com email e senha, construído sobre o composto `FormField`
- [ ] Um `User` do seed entra, vê o próprio nome e sai
- [ ] Credencial errada **não revela** se o email existe
- [ ] Conta pendente é explicada, com a ação de **reenviar a verificação** na própria tela
- [ ] Conta banida é explicada como decisão da loja, com caminho para o suporte
- [ ] Conta com troca de senha forçada é explicada, indicando o email como único caminho
- [ ] Excesso de tentativas mostra **quanto tempo esperar**, nunca mensagem genérica — e não
      afirma se foi lockout da conta ou rate limit por IP, porque o `code` é o mesmo
- [ ] A precedência das mensagens espelha a da API: travado por tentativas vence banido, que
      vence troca forçada, que vence pendente
- [ ] A ramificação é feita pelo `code`, e nenhum teste nem nenhuma tela depende do texto da
      `message`
- [ ] Erro de campo aparece embaixo do campo e é anunciado a leitor de tela
- [ ] Foco visível em tudo que é interativo
- [ ] A tela funciona em tela pequena e nos dois temas
- [ ] Botão em ação fica visivelmente ocupado e não aceita duplo clique
- [ ] E2E cobre: entrada, saída, credencial errada e **cada um dos quatro** estados bloqueados

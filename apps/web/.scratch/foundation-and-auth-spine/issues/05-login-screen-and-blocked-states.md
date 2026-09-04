# 05: Tela de login, saída e os quatro estados que travam a entrada

**What to build:** uma pessoa entra e sai da aplicação. E quando ela **não consegue** entrar,
a tela diz por quê e qual é o caminho de volta — em vez de responder "credenciais inválidas"
para tudo.

Nasce aqui o composto `FormField`, primeiro caso de uso real de formulário do projeto.

Os quatro estados vivem nesta tela porque a API recusa a entrada nos três primeiros: quem
está pendente **nunca alcança** o interior da aplicação, então o aviso de verificação e a ação
de reenviar precisam existir aqui.

Sobre os dados de teste: o seed da API já cria usuários **banidos** e **pendentes**. O estado
de troca de senha forçada é produzido no preparo do teste, por um administrador semeado. O
lockout é produzido por tentativas repetidas — e o teste **não** pode usar a conta isenta de
lockout.

**Blocked by:** 02, 04

**Status:** ready-for-agent

- [ ] Formulário de login com email e senha, construído sobre o composto `FormField`
- [ ] Um `User` do seed entra, vê o próprio nome e sai
- [ ] Credencial errada **não revela** se o email existe
- [ ] Conta pendente é explicada, com a ação de **reenviar a verificação** na própria tela
- [ ] Conta banida é explicada como decisão da loja, com caminho para o suporte
- [ ] Conta com troca de senha forçada é explicada, indicando o email como único caminho
- [ ] Excesso de tentativas mostra **quanto tempo esperar**, nunca mensagem genérica
- [ ] A precedência das mensagens espelha a da API: banido vence troca forçada, que vence
      pendente
- [ ] Erro de campo aparece embaixo do campo e é anunciado a leitor de tela
- [ ] Foco visível em tudo que é interativo
- [ ] A tela funciona em tela pequena e nos dois temas
- [ ] Botão em ação fica visivelmente ocupado e não aceita duplo clique
- [ ] E2E cobre: entrada, saída, credencial errada e **cada um dos quatro** estados bloqueados

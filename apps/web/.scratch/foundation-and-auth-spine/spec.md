# Spec — Fundação e espinha de autenticação

Status: ready-for-agent

Cobre a **fatia 0** (bootstrap do projeto) e a **fatia 1a** (espinha de autenticação) juntas.
A fatia 0 não tem valor visível para o usuário e a fatia 1a não existe sem ela.

Decisões estruturais desta spec já estão registradas em ADR-0001 a ADR-0005. A linguagem
segue o glossário em `CONTEXT.md`. A direção visual segue `docs/design-system.md`.

---

## Problem Statement

A API do Pet Oasis está no ar, completa e documentada, mas não existe nenhuma interface
humana para ela. Hoje o único jeito de um `User` existir no sistema é através de uma
ferramenta de desenvolvedor — Scalar, Bruno ou `curl`.

Isso trava tudo: não há como uma pessoa criar conta, verificar o email, entrar, recuperar a
senha esquecida, ou sequer descobrir que o produto existe. Toda a fundação de autenticação e
autorização construída na API — refresh rotativo, RBAC com overrides, verificação de email,
banimento, lockout, reativação de conta — é invisível e inalcançável para quem não sabe ler
uma especificação OpenAPI.

Antes de qualquer tela de domínio (pets, catálogo, vitrine), falta a espinha da qual todas
elas dependem: um `User` precisa conseguir provar quem é, e a aplicação precisa conseguir
manter e renovar essa prova com segurança.

## Solution

Um projeto Next.js novo, com o design system próprio, e a espinha de autenticação completa
funcionando ponta a ponta contra a API real.

Uma pessoa consegue se cadastrar, receber e usar o email de verificação, entrar, permanecer
entrada sem reautenticar a cada quinze minutos, sair, e recuperar a senha quando a esquece.
Quando a conta está bloqueada — pendente de verificação, banida, com troca de senha forçada,
ou travada por excesso de tentativas — a aplicação diz claramente qual é a situação e qual é
o caminho de volta, em vez de responder "credenciais inválidas" para tudo.

A sessão vive num BFF: os tokens ficam num cookie criptografado do domínio do front e nunca
chegam ao JavaScript do navegador. A renovação acontece sozinha, no servidor, antes de o
token expirar.

Ao fim desta fatia existe uma aplicação com identidade visual própria, tema claro e escuro,
que qualquer pessoa consegue usar — mesmo que ainda não haja nada para fazer depois de
entrar.

## User Stories

### Fundação

1. Como desenvolvedor, quero um repositório Git inicializado com a estrutura de branches
   acordada, para que o histórico do projeto comece organizado desde o primeiro commit.
2. Como desenvolvedor, quero um projeto Next.js com TypeScript em modo estrito, para que
   erros de tipo apareçam em tempo de compilação e não em produção.
3. Como desenvolvedor, quero os tokens do design system definidos como custom properties,
   para que trocar uma cor seja uma edição num lugar só.
4. Como desenvolvedor, quero que cada token nasça com o par claro e escuro, para que o tema
   escuro nunca precise ser retrofitado sobre uma paleta já espalhada.
5. Como desenvolvedor, quero as fontes auto-hospedadas no build, para que nenhuma requisição
   saia para um terceiro em tempo de execução.
6. Como desenvolvedor, quero os tipos da API gerados a partir da especificação OpenAPI dela e
   versionados no repositório, para que o build nunca dependa da API estar de pé.
7. Como desenvolvedor, quero um único cliente HTTP tipado para falar com a API, para que
   autenticação, escolha de endereço e tratamento de erro existam num lugar só.
8. Como desenvolvedor, quero lint e formatação numa ferramenta só, para que não haja duas
   ferramentas discordando sobre o mesmo arquivo.
9. Como desenvolvedor, quero rodar a aplicação em desenvolvimento contra a API em Docker,
   para que o que eu vejo localmente seja o comportamento real da API.
10. Como desenvolvedor, quero um container de produção pronto, para que o deploy no VPS seja
    o mesmo procedimento que já existe para a API.

### Cadastro

11. Como visitante, quero criar uma conta informando nome, CPF, email, telefone e senha, para
    que eu possa passar a usar o sistema.
12. Como visitante, quero que o telefone aceite a máscara que eu conheço, para que eu não
    precise adivinhar o formato que o sistema espera.
13. Como visitante, quero ver os requisitos da senha antes de errar, para que eu não descubra
    a regra por tentativa e erro.
14. Como visitante, quero que um campo inválido mostre o erro embaixo dele mesmo, para que eu
    saiba exatamente o que corrigir.
15. Como visitante, quero saber que um email ou CPF já está em uso, para que eu perceba que
    já tenho conta em vez de tentar de novo.
16. Como visitante que já teve conta e a excluiu, quero que o cadastro com o mesmo email me
    ofereça o caminho de reativação, para que eu recupere o que era meu em vez de recomeçar.
17. Como visitante, quero ser informado de que preciso verificar meu email logo após o
    cadastro, para que eu saiba que o processo ainda não terminou.
18. Como visitante, quero que o cadastro seja protegido contra excesso de tentativas, para
    que a plataforma não seja usada para enviar email em massa em meu nome.

### Verificação de email

19. Como `User` recém-cadastrado, quero clicar no link do email e ter minha conta ativada,
    para que eu possa entrar.
20. Como `User`, quero que um link de verificação já usado ou expirado me diga isso
    claramente, para que eu não fique tentando o mesmo link.
21. Como `User` com link expirado, quero poder pedir um email novo pela própria tela, para
    que eu não precise refazer o cadastro.
22. Como `User`, quero ver confirmação visível de que a conta foi ativada, para que eu não
    fique em dúvida se funcionou.
23. Como `User`, quero ser levado ao login logo após a ativação, para que o próximo passo
    seja óbvio.

### Login

24. Como `User`, quero entrar com email e senha, para que eu acesse a parte autenticada.
25. Como `User`, quero que credencial errada não revele se o email existe, para que minha
    conta não possa ser descoberta por tentativa.
26. Como `User`, quero permanecer entrado ao recarregar a página, para que eu não precise
    reautenticar a cada navegação.
27. Como `User`, quero permanecer entrado depois de quinze minutos de uso, para que a
    expiração do token seja invisível para mim.
28. Como `User`, quero sair explicitamente, para que meu acesso termine quando eu decidir.
29. Como `User`, quero que sair encerre a sessão também no servidor, para que o token não
    continue válido depois.
30. Como `Híbrido`, quero cair na superfície certa depois de entrar, para que eu não precise
    navegar até onde eu ia de qualquer forma.
31. Como `User`, quero que o login seja protegido contra tentativas em massa, para que minha
    senha não possa ser adivinhada por força bruta.

### Estados que travam o login

32. Como `User` que ainda não verificou o email, quero saber que é isso que me impede de
    entrar, para que eu procure o email em vez de achar que errei a senha.
33. Como `User` que não verificou o email, quero poder reenviar a verificação a partir da
    tela de login, para que eu resolva na hora.
34. Como `User` banido, quero saber que minha conta foi bloqueada por decisão da loja, para
    que eu procure o suporte em vez de tentar de novo.
35. Como `User` com troca de senha forçada, quero saber que preciso redefinir a senha pelo
    email, para que eu entenda por que a senha correta não funciona.
36. Como `User` travado por excesso de tentativas, quero saber quanto tempo preciso esperar,
    para que eu não fique tentando às cegas.

### Recuperação de senha

37. Como `User` que esqueceu a senha, quero pedir um link de redefinição informando meu
    email, para que eu recupere o acesso.
38. Como `User`, quero que o pedido de redefinição responda igual para email existente e
    inexistente, para que ninguém descubra quem tem conta.
39. Como `User`, quero definir a senha nova pelo link do email, para que eu volte a entrar.
40. Como `User`, quero que um link de redefinição inválido ou expirado me diga isso e me
    ofereça pedir outro, para que eu não fique preso.
41. Como `User`, quero ser avisado de que redefinir a senha encerra minhas outras sessões,
    para que eu não estranhe ter que entrar de novo nos outros dispositivos.
42. Como `User`, quero ser levado ao login após redefinir, para que eu conclua o que vim
    fazer.

### Reativação de conta

43. Como ex-`User` cuja conta foi excluída, quero reativá-la pelo link do email, para que eu
    recupere meu histórico em vez de criar uma conta nova.
44. Como ex-`User` reativando, quero ser obrigado a definir uma senha nova, para que uma
    senha antiga possivelmente comprometida não volte a valer.
45. Como ex-`User` reativando, quero informar telefone quando o sistema precisar dele, para
    que meu perfil de `Customer` volte completo.
46. Como ex-`User`, quero que um link de reativação inválido ou expirado seja explicado
    claramente, para que eu saiba pedir outro.

### Sessão e guarda de rota

47. Como `User`, quero que uma página autenticada nunca apareça para quem não entrou, para
    que meus dados não vazem por descuido de navegação.
48. Como visitante que tentou abrir uma página autenticada, quero ser levado de volta ao
    destino original depois de entrar, para que eu não perca o caminho.
49. Como `User`, quero que minha sessão expirada me devolva ao login sem mensagem de erro,
    para que expirar não pareça culpa minha.
50. Como `User`, quero que meus tokens nunca fiquem acessíveis ao JavaScript da página, para
    que uma falha de script não entregue minha sessão.
51. Como `User`, quero que a renovação da sessão aconteça sozinha e antes de expirar, para
    que eu nunca veja uma falha por token vencido.
52. Como `User`, quero que abrir vários links ao mesmo tempo não me desconecte, para que
    navegar rápido não seja punido.
53. Como `User`, quero que a interface saiba quem eu sou e o que eu posso, para que ela mostre
    apenas o que faz sentido para mim.

### Erro e carregamento

54. Como `User`, quero que erros de formulário apareçam nos campos, para que eu corrija sem
    procurar.
55. Como `User`, quero que uma ação recusada por falta de permissão seja explicada, para que
    eu entenda em vez de achar que quebrou.
56. Como `User`, quero que uma falha do servidor me ofereça tentar de novo, para que eu não
    precise recarregar a página na mão.
57. Como `User`, quero ver a estrutura da página enquanto ela carrega, para que a espera
    pareça curta e previsível.
58. Como `User`, quero que um botão em ação fique visivelmente ocupado, para que eu não clique
    duas vezes.
59. Como `User`, quero que um link com token imprestável seja tratado como caso esperado e
    não como erro do sistema, para que eu saiba o que fazer em seguida.

### Design e acessibilidade

60. Como `User`, quero a interface no tema do meu sistema, para que ela não me ofusque à
    noite.
61. Como `User`, quero poder escolher o tema explicitamente, para que minha preferência valha
    mais que a do sistema.
62. Como `User` que navega por teclado, quero foco visível em tudo que é interativo, para que
    eu saiba onde estou.
63. Como `User` de leitor de tela, quero que os erros de formulário sejam anunciados, para que
    eu saiba o que falhou sem ver a tela.
64. Como `User` em celular, quero que os formulários funcionem confortavelmente na tela
    pequena, para que eu não precise de um computador.
65. Como `User`, quero que a aplicação carregue rápido, para que a primeira impressão não seja
    de espera.

## Implementation Decisions

### Estrutura da aplicação

- Next.js App Router. Grupos de rota: `(auth)` para as telas de entrada e recuperação,
  `(account)` para a área autenticada. `(storefront)` e `(admin)` são criados vazios ou nem
  criados — pertencem às fatias seguintes.
- **Quatro caminhos são contrato imposto pela API** e não podem ser renomeados:
  `/verify-email`, `/reset-password`, `/confirm-email-change` e
  `/confirm-account-reactivation`, todos recebendo o token por query string. A API monta
  esses links a partir do `APP_URL` dela. Nesta fatia, `/confirm-email-change` existe apenas
  como página funcional mínima: o fluxo que a alcança é da fatia 1b, mas o link pode chegar.
- Server Components por padrão. `"use client"` apenas onde a interação exige.

### Sessão e BFF

- A autenticação é proxyada por Route Handlers do próprio front. O navegador nunca fala
  diretamente com a API para autenticar.
- A sessão vive num cookie `httpOnly` criptografado do domínio do front, gerido por
  `iron-session`. O cookie contém **apenas** os tokens e o identificador do `User` — nunca a
  **capability efetiva**, que é sempre buscada fresca.
- O módulo de sessão é a fronteira única dessa responsabilidade. Sua interface pública é
  estreita de propósito, e é o contrato do seam de teste:

  ```
  createSession(credentials)   → Session
  getSession()                 → Session | null
  destroySession()             → void
  ensureFreshSession(request)  → Session | null
  ```

  O módulo recebe **relógio** e **cliente da API** por injeção. Nada de rotação vive fora
  dele.
- `ensureFreshSession` é o que o middleware chama. A renovação é **proativa**, com margem de
  60 segundos antes da expiração do access token. Renovação reativa é impossível: Server
  Component não escreve cookie.
- Três travas obrigatórias contra falso positivo de reuso de refresh (ADR-0001): a renovação
  **não** acontece em requisição de prefetch; a renovação é *single-flight* por sessão; o
  `matcher` do middleware exclui estático e imagem. Mexer nelas sem ler o ADR-0001 desloga
  usuários de todos os dispositivos.
- O middleware decide **apenas** se há sessão. Ele não consulta **capability efetiva** e não
  faz autorização por feature.

### Identidade e autorização na interface

- A identidade do `User` e suas **capabilities efetivas** são lidas da API por requisição,
  numa função memoizada por requisição. O resultado nunca é persistido no cookie.
- `can()` decide apenas visibilidade de afordância. Ele **precisa honrar o wildcard** que
  significa "pode tudo", senão o administrador não vê nada. Ele nunca protege recurso: a
  autorização é da API.
- O destino após o login depende do perfil: quem tem perfil de `Employee` ativo — incluindo o
  `Híbrido` — vai para o Back-office; os demais vão para a Área do cliente. Nesta fatia o
  Back-office ainda não existe, então o `Híbrido` cai numa página de destino provisória. O
  switcher de contexto pertence à fatia do Back-office.

### Cliente da API

- Um único cliente HTTP tipado, que resolve o endereço da API por ambiente: **rede interna do
  Docker** para chamadas do servidor, endereço público apenas para URL de imagem.
- O cliente repassa o endereço IP do visitante em `X-Forwarded-For`. Isso é preparação para o
  item correspondente no backlog da API; enquanto ela não confiar em dois saltos, o cabeçalho
  é ignorado e nada quebra.
- Os tipos vêm da especificação OpenAPI da API, gerados e versionados, com um script de
  regeneração. Zod valida **formulário**, nunca resposta (ADR-0003).

### Tratamento de erro

| Resposta da API | Tratamento na interface |
|---|---|
| 400 (token imprestável) | Estado próprio da página: explica que o link é inválido ou expirou e oferece pedir outro. **Não é erro de sistema** |
| 401 no login | Mensagem por condição: credencial inválida, conta pendente, banida, ou troca de senha forçada |
| 401 em rota autenticada | Redirect ao login preservando o destino, sem mensagem de erro |
| 403 | Aviso destacado — é sinal de `can()` esquecido |
| 409 | Inline no campo quando a resposta o nomeia; aviso quando não |
| 422 | Inline por campo |
| 429 | Mensagem com o tempo de espera, nunca genérica |
| 5xx | Página de erro com opção de tentar de novo |

O 400 é a linha nova em relação à tabela do `CLAUDE.md`: a API responde 400 genérico para
token inexistente, expirado ou já usado, sem revelar qual dos três. Os quatro fluxos por
link dependem disso.

### Design system

- Tokens em custom properties, no espaço de cor do Tailwind 4. Direção "Eucalipto & Creme",
  conforme `docs/design-system.md`.
- **Cada token e cada componente nasce com a versão escura.** Não é uma etapa final.
- Seletor de tema com três estados: claro, escuro e o do sistema. A escolha explícita
  persiste entre visitas.
- Fontes auto-hospedadas em build.
- Desta fatia sai apenas o composto `FormField`, porque é o único que o escopo exige. Os
  demais compostos previstos nascem na fatia que os usa.
- Todo par de cor precisa atingir WCAG AA. Contraste é medido, não estimado.

### Ambiente

- Desenvolvimento roda no host, na porta 3001, contra a API em Docker. Isso exige apontar o
  `APP_URL` do ambiente de desenvolvimento da API para essa porta — é ela que monta os links
  dos emails.
- Produção é um container próprio, no mesmo VPS e no mesmo network Docker da API.
- Lint e formatação por uma ferramenta só, com as regras específicas do framework ativas.

## Testing Decisions

### O que faz um bom teste aqui

Um bom teste afirma sobre **comportamento observável** e não sobre estrutura interna. Ele
descreve o que uma pessoa consegue fazer, não como o código está organizado. Um teste que
quebra quando um componente é renomeado, extraído ou reorganizado — sem que nada tenha mudado
para quem usa — é um teste ruim.

A pergunta de controle para qualquer teste deste repositório: **o que este teste finge?** A
resposta precisa ser "nada" ou "o relógio e o cliente da API". Qualquer outra resposta indica
um seam novo, que precisa de justificativa explícita.

### Os dois seams

**Seam 1 — navegador, aplicação e API real.** Playwright contra a aplicação rodando e a API
subida pelo Docker Compose do repositório da API, com banco, Redis e servidor de email reais.
Nada é falsificado.

Cobre os fluxos ponta a ponta: cadastro, verificação por email, entrada, guarda de rota,
saída, recuperação de senha e reativação de conta. Cobre também os quatro estados que travam
a entrada, o redirect com destino preservado, e o erro 422 aparecendo no campo certo.

O link de verificação é lido programaticamente do servidor de email de desenvolvimento, que
já faz parte do Compose da API. Os dados de teste vêm dos seeds que a API já oferece.

**Seam 2 — a fronteira do módulo de sessão.** Testes rápidos, sem navegador e sem rede, com
relógio e cliente da API injetados.

Existe por um motivo específico e único: o access token vive quinze minutos, e provar
"renova na margem de sessenta segundos" pelo Seam 1 exigiria esperar catorze minutos. As
duas travas mais importantes — *single-flight* e prefetch — também não são determinísticas
através de um navegador.

Cobre: renovação proativa na margem; chamadas concorrentes produzindo **uma** renovação;
requisição de prefetch nunca renovando; recusa da API destruindo a sessão; e o conteúdo do
cookie, provando que a **capability efetiva** não é persistida.

### Alvos que não são seams

`can()` e a conversão do envelope de erro da API em erro por campo são funções puras. Elas
recebem valores e devolvem um valor, sem dependência a substituir. São testadas diretamente
e não acrescentam ponto de acoplamento algum.

Para `can()`, os casos que importam são o wildcard de administrador e a negação explícita
sobrepondo uma concessão — ambos caros de montar no Seam 1, porque exigiriam semear um `User`
com override específico.

### O que não é testado

**Nenhum teste afirma sobre estrutura de DOM, hierarquia de componente ou classe de CSS**
(ADR-0005). Não há biblioteca de interceptação de rede no projeto: o Seam 1 usa a rede real
e o Seam 2 usa injeção. Duas formas de falsificar a mesma coisa seriam uma a mais.

### Prior art

Este repositório está vazio, então não há precedente interno. O precedente de **forma** está
nos testes de integração do repositório da API: preparar dado real, exercitar a fronteira
pública, afirmar sobre a resposta observável. A ferramenta é diferente; a postura é a mesma.

## Out of Scope

- **Fatia 1b inteira**: trocar senha estando entrado, trocar email e sua confirmação, listar
  e revogar sessões. `/confirm-email-change` entra apenas como página funcional mínima,
  porque o link pode chegar.
- **Área do cliente com domínio**: pets, dados do `Customer`. Esta fatia entrega a área
  autenticada como casca.
- **Back-office**, e portanto o switcher de contexto do `Híbrido`. O destino do `Híbrido`
  após o login é provisório nesta fatia.
- **Vitrine**, catálogo, busca, SEO e renderização incremental.
- **Compostos do design system que esta fatia não usa**: tabela de dados, formatação
  monetária, estado vazio.
- **Internacionalização.** A interface é pt-BR sem biblioteca de tradução.
- **Deploy automático e branch de integração.** O deploy é manual; a branch `dev` nasce no
  dia em que houver automação.
- **Os três itens no backlog da API.** Nenhum deles bloqueia esta fatia. O item do endereço
  IP bloqueia a Vitrine com busca, que é a fatia 3.
- **Otimização de imagem.** Não há imagem de domínio nesta fatia.

## Further Notes

**Uma conta pendente não consegue entrar.** Confirmado no serviço de autenticação da API: a
verificação de status acontece durante o login, junto com banimento e troca de senha forçada,
e as três recusam a entrada. A consequência de desenho é direta: **não existe** um aviso de
"verifique seu email" dentro da aplicação, porque a pessoa nunca chega lá. Esse aviso, e a
ação de reenviar a verificação, precisam viver na **tela de login**. Um desenho que assuma o
contrário terá de ser refeito.

**A ordem das recusas no login importa e não é nossa.** A API verifica banimento primeiro,
depois troca de senha forçada, depois status pendente. Uma conta que esteja em mais de uma
dessas condições exibe a mensagem da mais severa. A interface reflete a ordem da API; não
tenta recompô-la.

**O telefone é normalizado pela API**, que descarta tudo que não é dígito e exige dez ou onze
dígitos com DDD. O formulário pode oferecer máscara livremente.

**O documento do design system diz que quatro compostos existem "desde o primeiro dia".** A
intenção ali é sobre o catálogo do design system, não sobre esta fatia. Construir tabela de
dados e formatação monetária agora seria construir sem caso de uso — e componente sem uso
real nasce com a interface errada.

**Ordem de virada do `APP_URL` em produção.** O ADR-0004 registra que apontar o `APP_URL` da
API para o front antes de as quatro rotas de token existirem transforma verificação e reset
em 404. Esta fatia é justamente a que entrega essas rotas, então ela é o pré-requisito da
virada — não o contrário.

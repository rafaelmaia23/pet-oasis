# 02: Tokens, tema claro e escuro, tipografia

**What to build:** a identidade visual do projeto existe e funciona nos dois temas. Uma
pessoa vê a aplicação no tema do sistema, consegue escolher claro ou escuro explicitamente, e
sua escolha sobrevive a fechar o navegador.

Direção "Eucalipto & Creme", conforme o documento de design system.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Todos os tokens definidos como custom properties, no espaço de cor do Tailwind 4
- [ ] **Cada token tem par claro e escuro.** Nenhuma cor existe só num dos temas
- [ ] Nenhuma cor tem sua única definição dentro de um bloco de tema — todo token tem base
- [ ] Outfit e Instrument Sans carregadas de forma auto-hospedada no build; nenhuma requisição
      a terceiro em tempo de execução
- [ ] Algarismos tabulares disponíveis para tabela e valor monetário. Se a fonte de corpo não
      oferecer o recurso, a alternativa está resolvida e registrada no documento de design
- [ ] Seletor de tema com três estados: claro, escuro e o do sistema
- [ ] A escolha explícita persiste entre visitas e vence a preferência do sistema
- [ ] Todo par de cor de texto sobre fundo atinge WCAG AA, **medido** e registrado — não
      estimado
- [ ] shadcn instalado e apontado para os tokens do projeto, não para o tema padrão dele
- [ ] Uma página de amostra mostra paleta, tipografia e estados nos dois temas

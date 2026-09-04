# 14: Virar a URL pública do cliente para o apex

**What to build:** os quatro emails da API passam a apontar para o front. É o passo que
completa a migração de domínio — e é o último da fase porque virar antes transforma verificação
de conta e reset de senha em **404**, que são justamente os fluxos que travam conta nova.

**Blocked by:** 06 — e, **cruzando para o outro repositório**, os tickets do `pet-oasis-web` que
entregam as quatro rotas de email. A aresta é externa e é declarada aqui de propósito: deixar
este passo fora da fase o transformaria num item operacional sem dono, e passo sem dono é passo
que ninguém executa.

**Status:** ready-for-agent

- [ ] Confirmado, antes de qualquer mudança, que as quatro rotas estão **no ar** no front, com o
      parâmetro de token: verificação de email, redefinição de senha, confirmação de troca de
      email e confirmação de reativação de conta. Os nomes são **contrato**, não escolha nossa:
      renomear qualquer um quebra o email correspondente sem erro visível em lugar nenhum — nem
      no cliente, nem na API, nem no log. Só o destinatário vê o 404.
- [ ] A variável de URL pública do cliente passa a apontar para o apex.
- [ ] O apex passa a servir o container do front.
- [ ] **Verificação manual, ponta a ponta, dos quatro fluxos**: disparar cada email e seguir o
      link até a página funcionar. É a única forma de provar isto, e a consequência de não
      provar é conta nova travada sem sinal em lugar nenhum.
- [ ] Os 301 da issue 06 continuam funcionando depois da virada.
- [ ] O aviso de "estado-alvo" no topo do guia de integração é removido, e o backlog é atualizado:
      as entradas de necessidades do front são marcadas como resolvidas, e as duas premissas que
      esta fase corrigiu (confiar em dois saltos; guardar o hash anterior na sessão) são
      reescritas narrando a correção.

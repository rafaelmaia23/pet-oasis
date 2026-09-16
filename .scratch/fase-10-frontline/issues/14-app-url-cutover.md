# 14: Virar a URL pública do cliente para o apex

**What to build:** os quatro emails da API passam a apontar para o front. É o passo que
completa a migração de domínio — e é o último da fase porque virar antes transforma verificação
de conta e reset de senha em **404**, que são justamente os fluxos que travam conta nova.

**Blocked by:** 06 — e, **cruzando para o outro repositório**, os tickets do `pet-oasis-web` que
entregam as quatro rotas de email. A aresta é externa e é declarada aqui de propósito: deixar
este passo fora da fase o transformaria num item operacional sem dono, e passo sem dono é passo
que ninguém executa.

**Status:** fechada em 2026-09-16

**Decisão (usuário, 2026-09-16):** a issue fecha **do lado do backend**. O que a API devia
fazer está feito — `APP_URL` aponta para o apex (`https://pet-oasis.maiahub.com.br`) no
`.env.production`, e o backend liberou o apex. Subir o front com as quatro rotas, apontar o
proxy host do apex para o container dele e testar os quatro emails ponta a ponta é trabalho do
`pet-oasis-web`, não deste repositório; esta pasta guarda só issues de backend. Os dois itens
de agente que viviam aqui (aviso de "estado-alvo" no guia de integração; reescrita das
premissas do backlog) são fecho da fase e foram para a issue 21.

- [ ] Confirmado, antes de qualquer mudança, que as quatro rotas estão **no ar** no front, com o
      parâmetro de token: verificação de email, redefinição de senha, confirmação de troca de
      email e confirmação de reativação de conta. Os nomes são **contrato**, não escolha nossa:
      renomear qualquer um quebra o email correspondente sem erro visível em lugar nenhum — nem
      no cliente, nem na API, nem no log. Só o destinatário vê o 404.
- [x] A variável de URL pública do cliente passa a apontar para o apex *(feito no servidor em
      2026-09-16, **antes** de o front estar no ar — aceito porque a demo é efêmera e sem conta
      real; enquanto o front não subir, o link dos quatro emails responde 404. Atenção: foi
      gravado `http://`, e o apex força `https://` — corrigir para `https://` no `.env.production`.)*
- [ ] O apex passa a servir o container do front.
- [ ] **Verificação manual, ponta a ponta, dos quatro fluxos**: disparar cada email e seguir o
      link até a página funcionar. É a única forma de provar isto, e a consequência de não
      provar é conta nova travada sem sinal em lugar nenhum.
- [~] ~~Os 301 da issue 06 continuam funcionando depois da virada.~~ — sem objeto: os 301 foram
      descartados na 06 (2026-09-16).
- [ ] O aviso de "estado-alvo" no topo do guia de integração é removido, e o backlog é atualizado:
      as entradas de necessidades do front são marcadas como resolvidas, e as duas premissas que
      esta fase corrigiu (confiar em dois saltos; guardar o hash anterior na sessão) são
      reescritas narrando a correção.

## Estado em 2026-09-16

Sondagem de fora: `https://pet-oasis.maiahub.com.br/` responde `302 → /reference` (ainda é a API
da Fase 9 no apex) e `/verify-email?token=x` responde **404** — o front não está no apex. O que
falta, portanto: (1) o `pet-oasis-web` no ar com as quatro rotas; (2) o proxy host do apex no NPM
apontado para o container do front — hoje aponta para a API, e o deploy da fase renomeia o
container (`pet-oasis-app` → `pet-oasis-api`), o que quebraria o apex de qualquer forma se ele
continuar apontando para o nome antigo; (3) `APP_URL` com `https://`; (4) a verificação ponta a
ponta dos quatro fluxos; (5) os dois itens de agente do fecho (aviso do guia, backlog).

# Lockout híbrido — janela fixa → backoff exponencial

> Decisão migrada em 2026-09-18 do contexto temático da API (**Segurança** › *Rate limit e lockout*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

`N` tentativas erradas consecutivas travam o usuário por uma janela fixa; se, depois de a janela
liberar, a próxima também errar, o tempo dobra a cada ciclo até um teto. Reseta (contador **e**
nível de backoff) no login certo. Janela fixa sozinha é previsível e barata de testar, mas um
atacante que espera exatamente o tempo da janela nunca é penalizado mais que isso; o backoff
crescente fecha a lacuna sem punir o usuário legítimo que errou a senha uma vez (só entra em
jogo depois de ciclos repetidos).

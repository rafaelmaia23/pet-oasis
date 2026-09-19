# Duas flags independentes: `SEED_FAKE_DATA` e `SEED_ADMIN_USER`

> Decisão migrada em 2026-09-18 do contexto temático da API (**Infraestrutura** › *Dataset fake*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

O dataset fake (customers/employees/híbridos) é seguro no demo público — mesmo com escrita
disponível via roles `manager`, o dano fica contido ao próprio dataset e o `demo-reset` diário
restaura. Já o usuário admin de teste tem acesso total (`*`): diferente do demo (só leitura, com
credencial pública assumida como risco baixo), uma conta de escrita irrestrita exposta na internet é
superfície de ataque real, mesmo com os dados voltando todo dia. Separar as flags permite ligar o
dataset fake em produção/demo sem nunca ligar o admin lá — `SEED_ADMIN_USER` só existe em
`.env.development`.

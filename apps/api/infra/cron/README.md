# infra/cron — agendamento dos scripts de manutenção

Corte de responsabilidade (`docs/adr/0101-src-scripts-codigo-infra-agendamento.md`): `src/scripts/` é código
(bundlado pelo tsup, roda com `node dist/<script>.js`); esta pasta é só
agendamento. Nenhum destes timers é instalado automaticamente pelo Compose —
é um passo manual do deploy, no host que roda `pet-oasis-api` (produção).

systemd timer em vez de cron: dá `journalctl -u <serviço>` para depurar
execuções, `Persistent=true` (recupera a janela perdida se o host estava
desligado) e não sobrepõe execuções do mesmo timer.

`pet-oasis-demo-reset` só faz sentido num deploy demo — o próprio script se
recusa a rodar sem `DEMO_MODE=true` no `.env.production` do host (guarda
explícita, nunca inferida de `NODE_ENV`). Instalar o timer num deploy que não
é o demo é inofensivo (o `.service` falha alto todo dia, sem apagar nada),
mas não tem por que instalar.

## Instalar (no servidor, como root)

```sh
sudo cp infra/cron/*.service infra/cron/*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pet-oasis-cleanup-sessions.timer
sudo systemctl enable --now pet-oasis-cleanup-audit-log.timer
# Só no deploy demo (DEMO_MODE=true):
sudo systemctl enable --now pet-oasis-demo-reset.timer
```

## Verificar

```sh
systemctl list-timers 'pet-oasis-*'
journalctl -u pet-oasis-cleanup-sessions.service
```

## Rodar manualmente (sem esperar o timer)

```sh
sudo systemctl start pet-oasis-cleanup-sessions.service
```

## Trocar as units quando o nome do container muda

Cada `.service` chama `docker exec <container> node dist/<script>.js`, então o nome do
container está **gravado na unit**. Renomear o container sem reinstalar as units deixa os três
timers falhando em silêncio até alguém abrir o `journalctl` — eles disparam, o `docker exec`
não acha o container, e o timer segue agendado como se nada tivesse acontecido.

Foi o que aconteceu na Fase 10, ao renomear `pet-oasis-app` → `pet-oasis-api`. O procedimento
abaixo serve para qualquer renomeação futura.

**Ordem importa, e são duas ordens diferentes:** reinstale as units **antes** do `prod:up` que
renomeia o container, mas rode a verificação manual **depois** dele. As units só são exercitadas
quando disparam, então reinstalar primeiro não quebra nada — enquanto o container velho ainda
existe, o timer novo é que erraria, e nenhum dos três roda com frequência suficiente para pegar
essa janela de minutos. A execução manual, ao contrário, é um `docker exec` de verdade: rodada
antes do deploy ela falha por construção, porque o container com o nome novo ainda não existe.

```sh
# 1. Desligar e remover as units antigas
sudo systemctl disable --now pet-oasis-cleanup-sessions.timer
sudo systemctl disable --now pet-oasis-cleanup-audit-log.timer
sudo systemctl disable --now pet-oasis-demo-reset.timer   # só no deploy demo

sudo rm /etc/systemd/system/pet-oasis-cleanup-sessions.{service,timer}
sudo rm /etc/systemd/system/pet-oasis-cleanup-audit-log.{service,timer}
sudo rm /etc/systemd/system/pet-oasis-demo-reset.{service,timer}
sudo systemctl daemon-reload

# 2. Confirmar que não sobrou nenhuma
systemctl list-timers 'pet-oasis-*'        # não deve listar nada
systemctl list-unit-files 'pet-oasis-*'    # idem

# 3. Instalar as novas (do repo já atualizado)
sudo cp infra/cron/*.service infra/cron/*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pet-oasis-cleanup-sessions.timer
sudo systemctl enable --now pet-oasis-cleanup-audit-log.timer
sudo systemctl enable --now pet-oasis-demo-reset.timer     # só no deploy demo

# 4. Fazer o deploy que renomeia o container
pnpm run prod:up

# 5. Só agora, com o container novo de pé: provar que funcionam, sem esperar o agendamento
sudo systemctl start pet-oasis-cleanup-sessions.service
journalctl -u pet-oasis-cleanup-sessions.service -n 30 --no-pager
```

O passo 5 não é opcional. Uma unit que aponta para um container inexistente falha **de um jeito
que não te acorda**: sem alerta, sem página, só uma linha no journal que ninguém lê. Rodar uma
vez à mão é o que transforma "provavelmente está certo" em "está certo".

Os scripts são idempotentes e todos aceitam `--dry-run`, então rodar fora de hora não faz
estrago — exceto o `demo-reset`, que trunca e repovoa. Para ele, use `--dry-run` na verificação
se o deploy não for o demo descartável.

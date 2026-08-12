# infra/cron — agendamento dos scripts de manutenção

Corte de responsabilidade (docs/context/architecture.md): `src/scripts/` é código
(bundlado pelo tsup, roda com `node dist/<script>.js`); esta pasta é só
agendamento. Nenhum destes timers é instalado automaticamente pelo Compose —
é um passo manual do deploy, no host que roda `pet-oasis-app` (produção).

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

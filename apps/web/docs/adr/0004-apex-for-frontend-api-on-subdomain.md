# O apex passa a servir o front; a API vai para um subdomínio

`pet-oasis.maiahub.com.br` servia a API, redirecionando a raiz para a referência Scalar.
Passa a servir este front, e a API migra para `api.pet-oasis.maiahub.com.br`. O motivo é de
portfólio, não técnico: peça visual chama mais atenção do que UI de documentação de API.

Os dois rodam em containers Docker separados no mesmo VPS e no mesmo network. Toda chamada
que o front faz no servidor vai pela **rede interna** (`http://api:3000/api/v1`), nunca pela
URL pública — sem TLS, sem sair do host. Apenas as URLs de imagem são públicas, porque quem
as carrega é o navegador.

## Consequences

- **301 no apex** para `/reference` e `/openapi.json`. README, badges e o GIF da demo da API
  divulgam o apex, e link publicado não deve morrer.
- **`APP_URL` da API passa a apontar para o front**, e é ela que monta os links de quatro
  emails. Virar `APP_URL` antes de o front ter `/verify-email`, `/reset-password`,
  `/confirm-email-change` e `/confirm-account-reactivation` transforma verificação de conta
  e reset de senha em 404. A ordem correta é: subdomínio e redirects primeiro, `APP_URL`
  só no deploy da fatia 1a.
- **Renomear qualquer uma dessas quatro rotas quebra o email correspondente** sem erro
  visível em lugar nenhum. São contrato, não escolha nossa.
- **O rate limit por IP da API deixa de funcionar como pretendido.** Renderizando a vitrine
  no servidor, quem chama é o container do front: todos os visitantes colapsam num IP só e
  o site inteiro divide o balde `catalog-read` (300 req / 15 min). ISR esconde a maior parte
  mas não a busca, cuja cardinalidade de filtros gera cache miss constante. A correção é o
  front repassar `X-Forwarded-For` e a API confiar em dois saltos — registrada no backlog
  dela. **Até lá, a vitrine com busca fica bloqueada.**
- **Nenhuma migration para as imagens**: o banco da API guarda a chave do arquivo, nunca a
  URL completa (ADR `file-storage-and-uploads.md`), então trocar `UPLOAD_PUBLIC_BASE_URL`
  basta. E a spec não muda: `servers` é relativo (`/api/v1`).

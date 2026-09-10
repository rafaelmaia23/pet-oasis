# Integrar um serviço externo com a API

Para quem está construindo um cliente do `pet-oasis-api` — hoje o front web
(`pet-oasis-web`), amanhã o app mobile. Cobre como alcançar a API, o que ela espera receber, e
o que ela devolve quando algo dá errado.

A API é a **autoridade do domínio**: nenhuma regra de negócio dela é reimplementada no
cliente. O que o cliente decide é apresentação e navegação.

> ⚠️ **Este guia descreve o estado-alvo da Fase 10**, que está em execução. As seções 1, 2, 3
> e a tabela de recusas de login (§4) e a janela de graça (§5) descrevem comportamento que
> ainda está sendo implementado — construa contra elas, mas confirme em `docs/todo.md` se a
> issue correspondente já fechou antes de depender de uma em produção. Este aviso sai no
> fecho da fase.

---

## 1. Como alcançar a API

Há **duas** formas, e a escolha muda o que a API sabe sobre quem está chamando.

### Pela rede interna do Docker (serviço no mesmo VPS)

```
http://api:3000/api/v1
```

`api` é o nome do serviço no Compose de produção, registrado como alias de rede em toda rede
que ele integra. Sem TLS, sem sair do host, sem passar pelo nginx.

O cliente precisa entrar na rede **`pet-oasis`**, declarada como externa no compose dele:

```yaml
networks:
  petoasis:
    external: true
    name: pet-oasis
```

A rede é criada pelo compose de produção da API. Se a API não estiver de pé, o `up` do cliente
falha dizendo que a rede não existe — que é a mensagem certa.

Há três redes, e só uma é compartilhada:

| Rede | Quem entra | Alcança |
|---|---|---|
| `backend` (`internal: true`) | `db`, `redis`, `api` | Postgres e Redis, que não têm rota para a internet |
| `pet-oasis` | `api` + clientes internos | a API pela porta 3000 |
| `proxy` | `api` + clientes internos + nginx | o nginx, para ser servido ao público |

Um cliente na `pet-oasis` **não** alcança Postgres nem Redis. É de propósito.

### Pela URL pública

```
https://api.pet-oasis.maiahub.com.br/api/v1
```

Para o que roda no navegador de alguém ou fora do VPS. A porta 3000 **não é publicada no
host**: todo tráfego público entra pelo nginx.

> Prefira a rede interna sempre que o cliente rodar no mesmo VPS: é mais rápido e não gasta TLS.
> O que ela **não** faz é isentar de rate limit — os limitadores são chaveados por `req.ip`,
> venha ele de onde vier. O que decide o balde é o `X-Forwarded-For` da seção seguinte: com ele,
> cada visitante tem o seu; sem ele, a vitrine inteira divide o balde do container.

---

## 2. O IP do visitante: `X-Forwarded-For`

**O problema que isto resolve.** Rate limit, account lockout e audit log são chaveados por
`req.ip`. Quando um cliente renderiza no servidor, quem abre a conexão é o **container dele**,
não o visitante: todos os visitantes colapsam num IP só, dividem o mesmo balde de rate limit,
e o audit log passa a registrar o IP errado em toda linha.

**O contrato.** Todo cliente que chama a API **em nome de um visitante** repassa o IP dele em
`X-Forwarded-For`. Copiar o header que o cliente recebeu ou acrescentar o próprio salto — as
duas formas funcionam, porque a API confia por **endereço de origem**, não por contagem de
saltos:

```ts
app.set("trust proxy", ["loopback", "uniquelocal"]);
```

O Express caminha o `X-Forwarded-For` da direita para a esquerda pulando endereços confiáveis
e para no primeiro que não é — o que acerta tanto a cadeia `visitante → nginx → api` quanto
`visitante → nginx → cliente → api`, sem que nenhum dos dois lados precise saber o formato do
outro.

**O que torna isso seguro** é a porta 3000 não ser publicada: os únicos que alcançam a API por
endereço privado são o nginx e os containers das redes `proxy` e `pet-oasis`. Um
`X-Forwarded-For` vindo da internet não existe, porque a conexão da internet não existe.

**Chamada que não é em nome de um visitante** (um job, um health check, um script de
manutenção) não manda o header. Aí o IP registrado é o do próprio cliente, que é o correto.

---

## 3. CORS: quando se aplica, e quando não

CORS é mecanismo de **navegador**. Só importa quando o código que chama a API roda numa página
web servida por outra origem.

| Cliente | Precisa de CORS? |
|---|---|
| Front com BFF (o navegador fala com o próprio front, o front fala com a API pelo servidor) | **Não** — a requisição não tem `Origin` |
| App mobile nativo (Expo, Swift, Kotlin) | **Não** — não há navegador, não há preflight |
| Página web chamando a API direto do JavaScript | **Sim** |
| Script, job, `curl`, coleção Bruno | **Não** |

Se o seu caso é o terceiro, a origem precisa entrar na env var `CORS_ALLOWED_ORIGINS` da API
(lista separada por vírgula). Não há allowlist implícita: um cliente que não chama por
navegador **não** deve estar lá — permissão concedida por inércia é permissão que ninguém
revisa.

---

## 4. O envelope de erro

Toda resposta de erro tem a mesma forma:

```json
{
  "name": "ForbiddenError",
  "message": "Conta não verificada",
  "action": "Verifique seu email para ativar a conta",
  "statusCode": 403,
  "code": "EMAIL_NOT_VERIFIED",
  "requestId": "01J..."
}
```

- **`code`** é o discriminador legível por máquina. É nele que o cliente ramifica — nunca em
  `message`, que é prosa em pt-BR e pode ser reescrita a qualquer momento.
- **`message` e `action`** são texto para pessoa. `action` diz o que fazer a seguir.
- **`requestId`** é o mesmo do header `x-request-id`, e é o que liga o erro que a pessoa viu à
  linha de log do servidor. Vale exibir em tela de erro 5xx.
- Erro de validação (422) traz também **`errors`**: um mapa de campo → lista de mensagens,
  para renderizar inline no formulário.

### O que cada status significa aqui

| Status | Significado nesta API |
|---|---|
| **400** | Corpo malformado, ou **token imprestável** (inexistente, expirado ou já usado — a API não diz qual, de propósito: é anti-enumeração) |
| **401** | Não autenticado: sem token, token inválido, ou credencial errada |
| **403** | Autenticado, mas não permitido. Inclui as recusas de login **depois** de a senha conferir (ver abaixo) |
| **404** | Não existe, ou existe e você não pode saber que existe |
| **409** | Conflito de estado ou de unicidade. Quando a resposta nomeia o campo, dá para renderizar inline |
| **422** | Validação — traz `errors` por campo |
| **429** | Rate limit ou account lockout. Traz **`Retry-After`** em segundos; use o valor, não uma mensagem genérica |
| **503** | Dependência externa indisponível (email, e o caso de refresh concorrente descrito abaixo). É retentável |

### As recusas de login

`POST /auth/login` recusa em cinco condições, **nesta ordem**, e a distinção importa porque
cada uma pede uma tela diferente:

| Condição | Status | `code` |
|---|---|---|
| Email desconhecido ou senha errada | 401 | `UNAUTHORIZED` |
| Conta travada por tentativas erradas | 429 | `TOO_MANY_REQUESTS` (com `Retry-After`) |
| Conta banida | 403 | `ACCOUNT_BANNED` |
| Troca de senha forçada pelo admin | 403 | `PASSWORD_RESET_REQUIRED` |
| Conta ainda não verificada | 403 | `EMAIL_NOT_VERIFIED` |

As três de 403 só disparam **depois** de a senha conferir — quem as recebe é o dono da conta,
então não há vazamento em ramificar por elas. As duas primeiras são deliberadamente
indistinguíveis entre si.

Consequência de desenho para o cliente: **nenhuma conta pendente alcança o interior da
aplicação**. O aviso de "verifique seu email" e o reenvio da verificação pertencem à tela de
login, não a uma tela interna.

---

## 5. Sessão e renovação

O access token é um JWT de **15 minutos**, validado localmente pela API (sem consulta ao
banco). O refresh é um token opaco, rotativo: cada uso emite um novo e marca o anterior como
usado.

**Reapresentar um refresh já usado é tratado como roubo** e invalida **todas** as sessões do
usuário. É a proteção mais importante do módulo, e ela é agressiva de propósito.

**A janela de graça.** Um cliente que renove de forma concorrente — dois processos, ou uma
requisição de prefetch — apresentaria o mesmo token duas vezes e cairia nessa proteção sem ter
feito nada errado. Por isso, um refresh já usado é aceito por **10 segundos** a partir do momento
em que foi usado, e a API devolve **o par que já está valendo** naquela corrente de rotação, em vez
de emitir outro. Fora da janela, reuso continua sendo roubo e continua derrubando tudo.

O que o cliente precisa saber:

- **Não é licença para renovar em paralelo.** Serialize a renovação por sessão (single-flight)
  se puder; a janela é rede de segurança para a corrida que sobra, não substituto da trava.
- **O par que volta é o atual, não necessariamente o que aquela rotação emitiu.** Se o cliente
  rotacionou duas vezes dentro dos dez segundos, quem chega atrasado com o token mais antigo
  recebe o par **mais recente** — não um par intermediário já gasto. Trate a resposta como a
  verdade e sobrescreva o que tiver em mão.
- **Um 503 no `/auth/refresh` é retentável, e a retentativa é para agora.** Dentro da janela, se
  a API não conseguir reproduzir o par, ela responde 503 em vez de decidir entre "concorrência" e
  "roubo" — nenhuma sessão morre. Tente de novo **imediatamente**: uma retentativa que só chegue
  depois de a janela fechar é indistinguível de roubo, e aí a proteção dispara.
- **O `id` de uma sessão muda a cada renovação.** Uma linha de `Session` no banco é um **elo**
  de uma corrente de rotação, não a sessão de um dispositivo: `GET /auth/sessions` mostra um
  por dispositivo porque filtra os elos já usados. Não guarde o `id` de uma sessão entre
  telas — releia a lista.

---

## 6. As quatro rotas que são contrato

A API monta quatro links de email a partir da env var `APP_URL`, que aponta para o **cliente
web**. Estes caminhos, com estes nomes exatos e com `?token=`, são obrigação de quem serve o
`APP_URL`:

```
/verify-email?token=
/reset-password?token=
/confirm-email-change?token=
/confirm-account-reactivation?token=
```

Renomear qualquer um deles quebra o email correspondente **sem erro visível em lugar nenhum** —
nem no cliente, nem na API, nem no log. Só o destinatário vê o 404.

Corolário para a ordem de deploy: virar `APP_URL` para um cliente que ainda não tem as quatro
rotas no ar transforma verificação de conta e reset de senha em 404 — que são justamente os
fluxos que travam conta nova.

---

## 7. Imagens

O banco guarda a **chave** do arquivo, nunca a URL. O que o cliente recebe já vem montado a
partir de `UPLOAD_PUBLIC_BASE_URL`, e é sempre público — o navegador é quem carrega. Servidas
com `Cache-Control: immutable` e um ano de validade: o nome é um uuid e o conteúdo nunca é
reescrito (trocar a foto grava uma chave nova), então não há revalidação a fazer.

Se o cliente otimiza imagem no servidor (o `next/image` faz), o host precisa estar na
allowlist dele.

---

## 8. Descobrir o resto

- **`GET /openapi.json`** (público) — a especificação OpenAPI 3.1, gerada dos schemas Zod. É a
  fonte para gerar tipos no cliente.
- **`GET /reference`** (público) — a UI Scalar, interativa, com "try it".
- [`docs/reference/endpoints.md`](../reference/endpoints.md) — a lista de rotas em prosa, com
  a feature exigida por cada uma.
- **`GET /me`** — as capabilities efetivas do usuário. Use para **esconder afordância**, nunca
  para decidir permissão: quem decide é a API, e um `can()` esquecido resulta em 403, que é
  feio, não inseguro. Honre o wildcard `*`.

# A API atende num subdomínio, e o apex fica limpo (10.6)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Infraestrutura** › *Imagem e boot de produção*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

O endereço público da API é **`pet-oasis-api.maiahub.com.br`**. O apex fica para o front: numa
demo de portfólio a vitrine chama mais atenção que uma UI de documentação, e a API não perde
nada indo para um subdomínio. Sair do apex e entregá-lo ao front são **dois passos separados**,
e é de propósito — o segundo depende do front, o primeiro não (ver a ordem, no fim desta seção).

**O nome é de primeiro nível, e isso foi uma correção.** A primeira versão desta decisão
(2026-09-06) escolheu `api.pet-oasis.maiahub.com.br`, um nome de segundo nível sob o domínio.
O operador configurou DNS, certificado e proxy host para ele, e a verificação de fora
(2026-09-16) achou o handshake TLS falhando (`alert handshake failure`) antes de qualquer
requisição chegar ao servidor. A causa é da borda, não do servidor: os registros deste domínio
são **proxiados pela Cloudflare**, e o Universal SSL dela cobre só o apex e `*.maiahub.com.br` —
um segundo nível não tem certificado na borda. As saídas eram três: registro em *DNS only* (perde
o proxy da Cloudflare só nesse host), Advanced Certificate Manager (pago) ou trocar o nome. Trocar
o nome custou retrabalho de apontadores e foi o escolhido — o nome é o que menos importa nas
três, e é o único que não deixa exceção ou custo recorrente para trás.

**Os 301 no apex foram planejados e descartados.** A primeira versão prometia que o apex
manteria `301` em `/reference` e `/openapi.json` — os dois caminhos que o README e a coleção já
tinham divulgado —, para que link publicado não morresse na virada. Caiu na mesma revisão de
2026-09-16: a demo era quase não divulgada, então o link a preservar praticamente não existia, e
o custo era manter dois `location` **para sempre** num host que não é da API — resíduo que o
front herdaria sem saber por quê. O apex vai direto para o front; quem tinha o link antigo troca
a base. `/api/v1/*` nunca foi redirecionado: quem chama a API troca a base, e os nossos dois
apontadores (README e a coleção Bruno) apontam para o subdomínio.

**A cadeia de IP ganhou um salto, e ele é tratado no proxy.** A decisão da 10.2 descrevia duas
cadeias, `visitante → nginx → api` e `visitante → nginx → front → api`, e o `trust proxy` por
endereço privado ([`security.md`](README.md#segurança) § "`trust proxy` é por endereço de origem") acerta
as duas. Com o proxy da Cloudflare ligado, quem abre a conexão no reverse proxy é a **borda da
Cloudflare**, e o salto a mais quebraria a decisão: o proxy anexaria o próprio `$remote_addr` ao
`X-Forwarded-For`, a API receberia `visitante, ip-da-cloudflare`, e a caminhada da direita para a
esquerda pararia no IP da Cloudflare — que não é privado — com todos os visitantes num balde só,
o problema exato que a 10.2 resolveu. A correção mora no **proxy host**, não na API:
`real_ip_header CF-Connecting-IP; real_ip_recursive off;`. O Nginx Proxy Manager já confia nas
faixas da Cloudflare (`set_real_ip_from`, em `ip_ranges.conf`, baixado no boot), então
`$remote_addr` vira o visitante, a API recebe `visitante, visitante` e pega o visitante.
`recursive off` porque `CF-Connecting-IP` carrega um endereço, não uma lista. Vale para todo
proxy host que receba visitante pela Cloudflare — o da API e, quando o front subir, o do apex
(`visitante → Cloudflare → NPM → front → api`). A API não muda: o contrato dela continua sendo
"o primeiro endereço não-privado da direita para a esquerda", e é o proxy que garante que esse
endereço é o do visitante.

Duas coisas que a migração **não** custou, e as duas são dividendo de decisão antiga:

- **Nenhuma migration para as imagens.** O banco guarda a **chave** do arquivo e nunca a URL
  ([ADR de upload](0010-file-storage-and-uploads.md)), então trocar o host é trocar
  `UPLOAD_PUBLIC_BASE_URL` e mais nada — foi o que fez a troca de nome custar uma variável.
  A base pública das imagens segue a API, não o front: quem serve o byte é o `express.static`
  do Node, atrás do certificado do subdomínio.
- **Nenhuma mudança na especificação.** `servers: [{ url: "/api/v1" }]` em
  [`src/docs/openapi.ts`](../../src/docs/openapi.ts) é **relativo**, então o documento segue o
  host que o serviu. Um `servers` absoluto teria feito o Scalar do subdomínio disparar "try it"
  contra o host velho.

**A ordem era parte da decisão, e foi relaxada na execução (10.14).** A regra escrita: subdomínio
e certificado primeiro; `APP_URL` — que sempre quis dizer *o app que a pessoa vê*, e passa a
apontar para o front — só depois de o front ter no ar as quatro rotas de email (verificação,
redefinição de senha, confirmação de troca de email, confirmação de reativação), porque virar
antes transforma verificação de conta e reset de senha em 404, justamente os fluxos que destravam
conta nova, com a falha silenciosa em todo lugar menos na caixa de entrada de quem se cadastrou.
Na execução o dono do projeto virou `APP_URL` **antes** de o front subir, e por decisão: o único
ambiente de pé é uma demo efêmera, sem conta real, então o link 404 num email de demonstração não
custa nada — e amarrar o fecho da API ao calendário do front custava. A regra continua sendo a
regra para qualquer deploy com usuários; o que mudou foi o julgamento de que a demo não é um.
Do lado da API a migração está completa; subir o front no apex, apontar o proxy host do apex para
o container dele e provar os quatro fluxos ponta a ponta é trabalho do `pet-oasis-web`.

A configuração do reverse proxy (Nginx Proxy Manager, certificado por desafio DNS na
Cloudflare) continua **fora deste repositório** (mesmo motivo da seção seguinte); a forma que o
proxy host precisa ter e a verificação estão em [`deploy.md`](../guides/deploy.md).

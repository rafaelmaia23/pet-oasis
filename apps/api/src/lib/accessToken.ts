import jwt from "jsonwebtoken";
import ms from "ms";
import { env } from "@/config/env";

/**
 * O contrato do access token, em um lugar só (10.10): quem assina e quem
 * verifica leem as mesmas constantes, então não existe como emitir uma coisa e
 * aceitar outra. `jwt.verify` sem `algorithms` aceita qualquer algoritmo que o
 * header declare — é a *algorithm confusion* de manual —, e sem `issuer`/
 * `audience` aceita qualquer token que o segredo assine, de onde quer que venha.
 */

/**
 * HMAC com o segredo compartilhado. É o que `jsonwebtoken` já usava por
 * default com um segredo em string — pinar não muda o caminho feliz, só fecha
 * a porta para um header que peça outra coisa (`none`, `HS512`, ou `RS256`
 * com a chave pública no lugar do segredo).
 */
export const ACCESS_TOKEN_ALGORITHM = "HS256";

/**
 * Emissor e audiência coincidem porque a API é as duas coisas: quem cunha o
 * token e quem o consome. O ganho não está em distingui-los, e sim em exigi-los:
 * um token assinado pelo mesmo segredo mas emitido para outro fim (ou por outro
 * deploy que o compartilhe por engano) deixa de servir aqui.
 */
export const ACCESS_TOKEN_ISSUER = "pet-oasis-api";
export const ACCESS_TOKEN_AUDIENCE = "pet-oasis-api";

/**
 * Folga para o `exp` (e `nbf`, se um dia existir). Quem assina e quem verifica
 * é o mesmo serviço, sob NTP — a folga cobre desvio entre réplicas, não relógio
 * de cliente. Toda folga estende a vida útil do token na mesma medida, então
 * ela é curta de propósito.
 */
export const ACCESS_TOKEN_CLOCK_TOLERANCE_SECONDS = 5;

/**
 * A validade que `signAccessToken` grava no `exp`, na forma em que o cliente a
 * recebe (11.16): a string de `JWT_EXPIRES_IN` continua sendo a única
 * configuração, e o número que sai em `expiresIn` é lido dela pelo **mesmo**
 * parser (`ms`) e com o mesmo arredondamento que o `jsonwebtoken` aplica ao
 * assinar. Não existe uma segunda constante para desalinhar — e o formato já
 * foi conferido no limite do env (`timespanSchema`), então aqui só há o número.
 */
export const ACCESS_TOKEN_TTL_SECONDS = Math.floor(
  ms(env.JWT_EXPIRES_IN) / 1000,
);

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, {
    algorithm: ACCESS_TOKEN_ALGORITHM,
    issuer: ACCESS_TOKEN_ISSUER,
    audience: ACCESS_TOKEN_AUDIENCE,
    expiresIn: env.JWT_EXPIRES_IN,
  });
}

/**
 * Devolve o `sub` (id do usuário) de um token que passou por tudo — assinatura,
 * algoritmo, emissor, audiência, validade —, ou `null`. O motivo da recusa fica
 * de fora de propósito: quem chama responde o mesmo 401 genérico para todos.
 */
export function verifyAccessToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: [ACCESS_TOKEN_ALGORITHM],
      issuer: ACCESS_TOKEN_ISSUER,
      audience: ACCESS_TOKEN_AUDIENCE,
      clockTolerance: ACCESS_TOKEN_CLOCK_TOLERANCE_SECONDS,
    });

    if (typeof payload === "string" || !payload.sub) {
      return null;
    }

    return payload.sub;
  } catch {
    return null;
  }
}

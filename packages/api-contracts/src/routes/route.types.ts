import type { z } from "zod";
import type { RouteTag } from "./route.tags";

/**
 * O vocabulário da tabela de rotas. Uma entrada descreve **uma operação
 * inteira**: como chamá-la, o que ela aceita, o que ela devolve em cada status
 * e a prosa que explica o caso — tudo em zod puro, para o cliente não precisar
 * ler o `/openapi.json` nem escrever um path à mão.
 *
 * A tabela é a fonte; o `/openapi.json` da API é derivado dela por um
 * adaptador, e `apps/api/tests/unit/contracts/routeParity.test.ts` é a prova de
 * que o router do Express e esta tabela nunca divergem.
 */

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Pública (responde sem token) ou sob `Authorization: Bearer <access token>`. */
export type RouteAuth = "public" | "bearer";

export type RouteResponse = {
  description: string;
  /**
   * O corpo da resposta: uma view, ou a **escada de capability** em ordem — do
   * degrau que todo mundo vê ao mais destravado — quando a forma da resposta
   * muda com a feature efetiva de quem chama. Ausente = resposta sem corpo
   * (204).
   */
  view?: z.ZodType | readonly z.ZodType[];
};

export type RouteErrorResponse = {
  description: string;
  /** O envelope de erro que este status carrega (`errorResponseSchema` ou o do 422). */
  schema: z.ZodType;
  /** Headers que fazem parte do contrato deste erro (hoje só o `Retry-After` do 429). */
  // biome-ignore lint/suspicious/noExplicitAny: a forma do header é por rota; o que importa aqui é ser um objeto zod
  headers?: z.ZodObject<any>;
};

export type RouteDefinition = {
  method: HttpMethod;
  /**
   * O path no formato do **Express** (`/users/:id`), relativo a `/api/v1`. É
   * esta a forma comparada com o router no teste de paridade; quem monta a URL
   * final substituindo `:param` é o cliente, e quem converte para o template
   * `{id}` do OpenAPI é o adaptador da API.
   */
  path: string;
  /**
   * O grupo da operação na referência — a mesma tag do OpenAPI, e só uma das
   * declaradas em `route.tags.ts`.
   */
  tag: RouteTag;
  auth: RouteAuth;
  summary: string;
  description?: string;
  /** Envelope de request do contrato: `z.object({ body?, params?, query? })`. */
  // biome-ignore lint/suspicious/noExplicitAny: cada rota traz o próprio envelope; o shape é lido pelo adaptador
  request?: z.ZodObject<any>;
  /**
   * `"image"`: o corpo é `multipart/form-data` com **um** arquivo no campo
   * `file`. O formato aceito e o teto de tamanho são do servidor, não do
   * contrato — quem os declara é o adaptador da API, a partir da env var.
   */
  upload?: "image";
  /** As respostas de sucesso, por status. */
  responses: Record<number, RouteResponse>;
  /** O shape de erro, por status. Só os que esta rota realmente pode devolver. */
  errors: Record<number, RouteErrorResponse>;
};

/** Um domínio da tabela: as operações daquele recurso, nomeadas pela operação. */
export type RouteGroup = Record<string, RouteDefinition>;

/** A tabela inteira: um grupo por domínio. */
export type RouteTable = Record<string, RouteGroup>;

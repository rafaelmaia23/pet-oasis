import { offsetList, staticList } from "../pagination/list-envelope";
import {
  createPetSchema,
  listCustomerPetsSchema,
  listPetsSchema,
  petParamsSchema,
  updatePetSchema,
} from "../pet/pet.schema";
import { petViews } from "../pet/pet.views";
import { errorResponses, noContent } from "./responses";
import type { RouteGroup } from "./route.types";

export const petRoutes = {
  create: {
    method: "POST",
    path: "/customers/:customerId/pets",
    tag: "Pets",
    auth: "bearer",
    summary:
      "Cadastra um pet para um cliente — exige manage:pet (próprio) ou manage:pet:others",
    description:
      "`customerId` é o id do perfil de cliente (o mesmo que `GET /me` devolve em `customer`). Espécies com raça cadastrada (cão e gato) exigem `breedId`; as demais o proíbem — os dois desvios são 422.",
    request: createPetSchema,
    responses: {
      201: { description: "Pet cadastrado", view: petViews.default },
    },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
      409: errorResponses[409],
      422: errorResponses[422],
    },
  },
  listByCustomer: {
    method: "GET",
    path: "/customers/:customerId/pets",
    tag: "Pets",
    auth: "bearer",
    summary:
      "Lista os pets de um cliente — exige read:pet (próprio) ou read:pet:others",
    description:
      "Sem paginação (`meta {}`): a coleção é limitada pelo dono. Pet falecido continua na lista; pet excluído, não.",
    request: listCustomerPetsSchema,
    responses: {
      200: {
        description: "Pets do cliente",
        view: staticList(petViews.default),
      },
    },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
      422: errorResponses[422],
    },
  },
  list: {
    method: "GET",
    path: "/pets",
    tag: "Pets",
    auth: "bearer",
    summary: "Lista pets de todos os clientes — exige read:pet:others",
    description:
      "Listagem de balcão, paginada por offset e ordenável (`?sort=&order=`). Sem `?deceased=` a lista traz vivos e falecidos; pet excluído nunca aparece. `customerId`/`breedId` são filtros: id bem-formado que não existe devolve lista vazia, nunca 404.",
    request: listPetsSchema,
    responses: {
      200: {
        description: "Lista de pets",
        view: offsetList(petViews.default),
      },
    },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      422: errorResponses[422],
    },
  },
  get: {
    method: "GET",
    path: "/pets/:petId",
    tag: "Pets",
    auth: "bearer",
    summary: "Detalha um pet — exige read:pet (próprio) ou read:pet:others",
    request: petParamsSchema,
    responses: { 200: { description: "Pet", view: petViews.default } },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
      422: errorResponses[422],
    },
  },
  update: {
    method: "PATCH",
    path: "/pets/:petId",
    tag: "Pets",
    auth: "bearer",
    summary:
      "Atualiza um pet — exige manage:pet (próprio) ou manage:pet:others",
    description:
      "`customerId` (transferência), `deceasedAt` (use `POST /pets/{petId}/deceased`) e `photoPath` não são editáveis aqui. Trocar `species` re-executa a validação de raça sobre o estado resultante.",
    request: updatePetSchema,
    responses: {
      200: { description: "Pet atualizado", view: petViews.default },
    },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
      409: errorResponses[409],
      422: errorResponses[422],
    },
  },
  delete: {
    method: "DELETE",
    path: "/pets/:petId",
    tag: "Pets",
    auth: "bearer",
    summary:
      "Exclui um pet (soft delete) — exige manage:pet (próprio) ou manage:pet:others",
    request: petParamsSchema,
    responses: { 204: noContent },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
      422: errorResponses[422],
    },
  },
  markDeceased: {
    method: "POST",
    path: "/pets/:petId/deceased",
    tag: "Pets",
    auth: "bearer",
    summary: "Registra o falecimento do pet — exige manage:pet",
    description:
      "Falecimento é estado, não exclusão: o pet continua na lista do dono. Idempotente — remarcar não reescreve a data já registrada.",
    request: petParamsSchema,
    responses: { 204: noContent },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
      422: errorResponses[422],
    },
  },
  unmarkDeceased: {
    method: "DELETE",
    path: "/pets/:petId/deceased",
    tag: "Pets",
    auth: "bearer",
    summary:
      "Desfaz o registro de falecimento (marcação errada) — exige manage:pet",
    request: petParamsSchema,
    responses: { 204: noContent },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
      422: errorResponses[422],
    },
  },
  setPhoto: {
    method: "PUT",
    path: "/pets/:petId/photo",
    tag: "Pets",
    auth: "bearer",
    summary: "Define a foto do pet — exige manage:pet",
    description:
      "Valor **único**: `PUT` substitui a foto anterior e apaga o arquivo antigo. Devolve a ficha do pet — não existe recurso 'foto de pet' endereçável. `PATCH /pets/{petId}` recusa `photoPath` no corpo, então o upload é o único caminho.",
    request: petParamsSchema,
    upload: "image",
    responses: {
      200: {
        description: "Pet com a foto atualizada",
        view: petViews.default,
      },
    },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      413: errorResponses[413],
      422: errorResponses[422],
      429: errorResponses[429],
    },
  },
  deletePhoto: {
    method: "DELETE",
    path: "/pets/:petId/photo",
    tag: "Pets",
    auth: "bearer",
    summary: "Remove a foto do pet — exige manage:pet",
    description:
      "Apaga o arquivo e limpa a coluna. **Idempotente**: pet sem foto responde 204, porque o estado desejado já é o atual.",
    request: petParamsSchema,
    responses: { 204: noContent },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      422: errorResponses[422],
    },
  },
} as const satisfies RouteGroup;

import type { ZodOpenApiPathsObject } from "zod-openapi";
import { petViews } from "@/modules/pet/pet.presenter";
import {
  createPetSchema,
  listCustomerPetsSchema,
  petParamsSchema,
  updatePetSchema,
} from "@/modules/pet/pet.schema";
import {
  errorResponses,
  jsonResponse,
  noContentResponse,
  staticList,
} from "../components";
import { fromEnvelope } from "../helpers";

export const petPaths: ZodOpenApiPathsObject = {
  "/customers/{customerId}/pets": {
    post: {
      tags: ["Pets"],
      summary:
        "Cadastra um pet para um cliente — exige manage:pet (próprio) ou manage:pet:others",
      description:
        "`customerId` é o id do perfil de cliente (o mesmo que `GET /me` devolve em `customer`). Espécies com raça cadastrada (cão e gato) exigem `breedId`; as demais o proíbem — os dois desvios são 422.",
      ...fromEnvelope(createPetSchema),
      responses: {
        201: jsonResponse("Pet cadastrado", petViews.default),
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
        409: errorResponses[409],
        422: errorResponses[422],
      },
    },
    get: {
      tags: ["Pets"],
      summary:
        "Lista os pets de um cliente — exige read:pet (próprio) ou read:pet:others",
      description:
        "Sem paginação (`meta {}`): a coleção é limitada pelo dono. Pet falecido continua na lista; pet excluído, não.",
      ...fromEnvelope(listCustomerPetsSchema),
      responses: {
        200: jsonResponse("Pets do cliente", staticList(petViews.default)),
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
        422: errorResponses[422],
      },
    },
  },
  "/pets/{petId}": {
    get: {
      tags: ["Pets"],
      summary: "Detalha um pet — exige read:pet (próprio) ou read:pet:others",
      ...fromEnvelope(petParamsSchema),
      responses: {
        200: jsonResponse("Pet", petViews.default),
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
        422: errorResponses[422],
      },
    },
    patch: {
      tags: ["Pets"],
      summary:
        "Atualiza um pet — exige manage:pet (próprio) ou manage:pet:others",
      description:
        "`customerId` (transferência), `deceasedAt` (use `POST /pets/{petId}/deceased`) e `photoPath` não são editáveis aqui. Trocar `species` re-executa a validação de raça sobre o estado resultante.",
      ...fromEnvelope(updatePetSchema),
      responses: {
        200: jsonResponse("Pet atualizado", petViews.default),
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
        409: errorResponses[409],
        422: errorResponses[422],
      },
    },
    delete: {
      tags: ["Pets"],
      summary:
        "Exclui um pet (soft delete) — exige manage:pet (próprio) ou manage:pet:others",
      ...fromEnvelope(petParamsSchema),
      responses: {
        204: noContentResponse,
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
        422: errorResponses[422],
      },
    },
  },
  "/pets/{petId}/deceased": {
    post: {
      tags: ["Pets"],
      summary: "Registra o falecimento do pet — exige manage:pet",
      description:
        "Falecimento é estado, não exclusão: o pet continua na lista do dono. Idempotente — remarcar não reescreve a data já registrada.",
      ...fromEnvelope(petParamsSchema),
      responses: {
        204: noContentResponse,
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
        422: errorResponses[422],
      },
    },
    delete: {
      tags: ["Pets"],
      summary:
        "Desfaz o registro de falecimento (marcação errada) — exige manage:pet",
      ...fromEnvelope(petParamsSchema),
      responses: {
        204: noContentResponse,
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
        422: errorResponses[422],
      },
    },
  },
};

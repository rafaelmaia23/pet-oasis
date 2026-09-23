import { productStatusSchema } from "./catalog/catalog.enums";
import { petSexSchema, petSpeciesSchema } from "./pet/pet.enums";
import { profileKindSchema, userStatusSchema } from "./user/user.enums";

// Registro dos enums com dois donos, pela chave que o Prisma usa. É o que o
// teste de paridade da API percorre: para cada entrada, o enum gerado pelo
// Prisma de mesmo nome existe e tem exatamente estes valores; e todo enum do
// Prisma ou está aqui ou é declarado interno lá (nunca atravessa a rede). Enum
// novo no contrato que não entrar aqui não é comparado com nada — por isso o
// teste do pacote fixa o conteúdo deste objeto.
export const DOMAIN_ENUMS = {
  ProfileKind: profileKindSchema,
  UserStatus: userStatusSchema,
  PetSpecies: petSpeciesSchema,
  PetSex: petSexSchema,
  ProductStatus: productStatusSchema,
} as const;

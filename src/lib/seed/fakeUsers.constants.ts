import type { RoleName } from "@/modules/role/role.constants";
import { seededFaker } from "./seedFaker";

const FAKE_EMAIL_DOMAIN = "fake.petoasis.dev";

/**
 * O email de um fake, a partir do seu slug. Único lugar que conhece o domínio —
 * `fakePets.constants.ts` amarra os pets aos donos por esta função, e não
 * repetindo a string.
 */
export function fakeEmail(slug: string): string {
  return `${slug}@${FAKE_EMAIL_DOMAIN}`;
}

export type FakeUserTrait =
  | "NONE"
  | "PENDING"
  | "BANNED"
  | "DELETED_USER"
  | "DELETED_EMPLOYEE_PROFILE";

type FakeCustomerDefinition = {
  kind: "CUSTOMER";
  email: string;
  name: string;
  phone: string;
  trait: FakeUserTrait;
};

type FakeEmployeeDefinition = {
  kind: "EMPLOYEE";
  email: string;
  name: string;
  roleNames: RoleName[];
  trait: FakeUserTrait;
};

type FakeHybridDefinition = {
  kind: "HYBRID";
  email: string;
  name: string;
  phone: string;
  employeeRoleNames: RoleName[];
  trait: FakeUserTrait;
};

export type FakeUserDefinition =
  | FakeCustomerDefinition
  | FakeEmployeeDefinition
  | FakeHybridDefinition;

function fakeCustomer(
  slug: string,
  trait: FakeUserTrait = "NONE",
): FakeCustomerDefinition {
  const email = fakeEmail(slug);
  const faker = seededFaker(email);

  return {
    kind: "CUSTOMER",
    email,
    name: faker.person.fullName(),
    phone: faker.phone.number({ style: "international" }),
    trait,
  };
}

function fakeEmployee(
  slug: string,
  roleNames: RoleName[],
  trait: FakeUserTrait = "NONE",
): FakeEmployeeDefinition {
  const email = fakeEmail(slug);

  return {
    kind: "EMPLOYEE",
    email,
    name: seededFaker(email).person.fullName(),
    roleNames,
    trait,
  };
}

function fakeHybrid(
  slug: string,
  employeeRoleNames: RoleName[],
  trait: FakeUserTrait = "NONE",
): FakeHybridDefinition {
  const email = fakeEmail(slug);
  const faker = seededFaker(email);

  return {
    kind: "HYBRID",
    email,
    name: faker.person.fullName(),
    phone: faker.phone.number({ style: "international" }),
    employeeRoleNames,
    trait,
  };
}

/**
 * Roster declarativo do dataset fake (flag `SEED_FAKE_DATA`) — identidade fixa
 * por email (chave de idempotência em `seedFakeUsers.ts`). CPF é gerado à
 * parte, em `seedFakeUsers.ts`, só na criação (não precisa ser estável: uma vez
 * criado, reruns não tocam mais o registro).
 *
 * Nome e telefone vêm de um `faker` semeado pelo **email** de cada entrada, não
 * de uma instância sequencial (9.11/AB13): a ordem do array deixou de importar,
 * então acrescentar ou reordenar entrada não muda mais o nome de todas as
 * seguintes. Isso não é o que garante a idempotência — só o email fixo é.
 *
 * Os pets ficam em `fakePets.constants.ts`, amarrados a estes customers pelo
 * mesmo email fixo.
 */
export const FAKE_USER_ROSTER: FakeUserDefinition[] = [
  // Volume simples para popular listas paginadas.
  ...Array.from({ length: 8 }, (_, i) =>
    fakeCustomer(`customer${String(i + 1).padStart(2, "0")}`),
  ),
  fakeEmployee("employee01", ["attendant"]),
  fakeEmployee("employee02", ["attendant"]),
  fakeEmployee("employee03", ["attendant"]),
  fakeEmployee("employee04", ["manager"]),
  fakeEmployee("employee05", ["manager"]),
  // Um funcionário de cada role nova da 9.1: sem eles `stockist` e
  // `catalog-manager` existem só no seed de roles e ninguém consegue
  // exercitá-las em dev nem na demo.
  fakeEmployee("employee06", ["stockist"]),
  fakeEmployee("employee07", ["catalog-manager"]),

  // Híbridos — customer e employee no mesmo user (Fase 2: "adicionar perfil").
  fakeHybrid("hybrid01", ["attendant"]),
  fakeHybrid("hybrid02", ["manager"]),
  fakeHybrid("hybrid03", ["attendant"]),

  // Cenários de demonstração.
  fakeCustomer("pending-customer", "PENDING"),
  fakeCustomer("banned-customer", "BANNED"),
  fakeCustomer("deleted-user", "DELETED_USER"),
  fakeHybrid(
    "deleted-profile-hybrid",
    ["attendant"],
    "DELETED_EMPLOYEE_PROFILE",
  ),
];

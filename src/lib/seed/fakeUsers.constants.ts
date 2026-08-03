import { en, Faker } from "@faker-js/faker";
import type { RoleName } from "@/modules/role/role.constants";

// Instância própria (não o `faker` singleton compartilhado com os testes) —
// evita que semear com seed fixo mude o stream de valores que os testes
// consomem do `faker` global em outros arquivos.
const fakerSeed = new Faker({ locale: [en] });
fakerSeed.seed(20260803);

const FAKE_EMAIL_DOMAIN = "fake.petoasis.dev";

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
  return {
    kind: "CUSTOMER",
    email: `${slug}@${FAKE_EMAIL_DOMAIN}`,
    name: fakerSeed.person.fullName(),
    phone: fakerSeed.phone.number({ style: "international" }),
    trait,
  };
}

function fakeEmployee(
  slug: string,
  roleNames: RoleName[],
  trait: FakeUserTrait = "NONE",
): FakeEmployeeDefinition {
  return {
    kind: "EMPLOYEE",
    email: `${slug}@${FAKE_EMAIL_DOMAIN}`,
    name: fakerSeed.person.fullName(),
    roleNames,
    trait,
  };
}

function fakeHybrid(
  slug: string,
  employeeRoleNames: RoleName[],
  trait: FakeUserTrait = "NONE",
): FakeHybridDefinition {
  return {
    kind: "HYBRID",
    email: `${slug}@${FAKE_EMAIL_DOMAIN}`,
    name: fakerSeed.person.fullName(),
    phone: fakerSeed.phone.number({ style: "international" }),
    employeeRoleNames,
    trait,
  };
}

/**
 * Roster declarativo do dataset fake (flag `SEED_FAKE_DATA`) — identidade
 * fixa por email (chave de idempotência em `seedFakeUsers.ts`); nome/telefone
 * vêm de uma instância de faker com seed fixo (mais consistente entre
 * execuções, mas não é o que garante a idempotência — só o email fixo é).
 * CPF é gerado à parte, em `seedFakeUsers.ts`, só na criação (não precisa ser
 * estável: uma vez criado, reruns não tocam mais o registro).
 *
 * Quando a Fase 9 chegar, um `fakePets.constants.ts` no mesmo diretório segue
 * o mesmo padrão, amarrado a estes customers pelo email fixo.
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

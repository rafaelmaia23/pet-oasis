import { createNotFoundError } from "@/errors";
import type { AuthUser } from "@/lib/authorization";
import * as userRepository from "@/modules/user/user.repository";

type UserWithProfiles = NonNullable<
  Awaited<ReturnType<typeof userRepository.findUserById>>
>;

function toRoleSummary(role: UserWithProfiles["roles"][number]["role"]) {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    appliesTo: role.appliesTo,
  };
}

export async function getMe(authUser: AuthUser) {
  const user = await userRepository.findUserById(authUser.id);

  if (!user) {
    throw createNotFoundError({
      message: "Usuário não encontrado",
      action: "Faça login novamente",
    });
  }

  const customerRoles = user.roles
    .filter((userRole) => userRole.role.appliesTo === "CUSTOMER")
    .map((userRole) => toRoleSummary(userRole.role));

  const employeeRoles = user.roles
    .filter((userRole) => userRole.role.appliesTo === "EMPLOYEE")
    .map((userRole) => toRoleSummary(userRole.role));

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    cpf: user.cpf,
    customer:
      user.customer && !user.customer.deletedAt
        ? {
            phone: user.customer.phone,
            address: user.customer.address,
            birthDate: user.customer.birthDate,
            roles: customerRoles,
          }
        : null,
    employee:
      user.employee && !user.employee.deletedAt
        ? { hiringDate: user.employee.hiringDate, roles: employeeRoles }
        : null,
    features: Array.from(authUser.features).sort(),
  };
}

import { prisma } from "@/lib/prisma";

// Wipes only the transactional tables (users/sessions/tokens/profiles), in
// FK-safe order. It deliberately does NOT touch the reference tables
// (Feature, Role, RoleFeature): those are seeded once by the Vitest globalSetup
// and must survive between tests, because the factories (buildEmployee /
// buildCustomer) connect users to roles/features by name. Deleting them here
// would break every test that grants a role. Guarded by clearDatabase.guard.test.ts.
export async function clearDatabase() {
  // Sem FK: pode ir a qualquer momento. Append-only na app, mas o teardown de
  // teste faz hard delete para isolar cada teste.
  await prisma.auditLog.deleteMany();
  await prisma.userFeature.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.session.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.user.deleteMany();
}

import { prisma } from "@/lib/prisma";

type CreateUserData = {
  name: string;
  email: string;
  passwordHash: string;
};

type UpdateUserData = {
  name?: string | undefined;
  email?: string | undefined;
  passwordHash?: string | undefined;
};

export async function findUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    include: {
      features: {
        include: {
          feature: true,
        },
      },
    },
  });
}

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
    include: {
      features: {
        include: {
          feature: true,
        },
      },
    },
  });
}

export async function findAllUsers() {
  return prisma.user.findMany({
    include: {
      features: {
        include: {
          feature: true,
        },
      },
    },
  });
}

export async function createUser(data: CreateUserData) {
  return prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      passwordHash: data.passwordHash,
    },
  });
}

export async function updateUser(id: string, data: UpdateUserData) {
  return prisma.user.update({
    where: { id },
    data: {
      ...(data.name && { name: data.name }),
      ...(data.email && { email: data.email }),
      ...(data.passwordHash && { passwordHash: data.passwordHash }),
    },
  });
}

export async function deleteUser(id: string) {
  return prisma.user.delete({
    where: { id },
  });
}

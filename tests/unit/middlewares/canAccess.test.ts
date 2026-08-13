import { makeAuthUser } from "@tests/factories/user.factory";
import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { ForbiddenError, UnauthorizedError } from "@/errors";

/** Roda o middleware e devolve o erro que ele lançou, para afirmar sobre a mensagem. */
const forbiddenActionOf = (
  middleware: ReturnType<typeof canAccess>,
  req: Request,
): string | undefined => {
  try {
    middleware(req, {} as Response, (() => {}) as NextFunction);
  } catch (error) {
    if (error instanceof ForbiddenError) return error.action;
    throw error;
  }

  throw new Error("o middleware deveria ter recusado");
};

import type { AuthUser } from "@/lib/authorization";
import { canAccess } from "@/middlewares/canAccess.middleware";

function makeReq(user?: AuthUser): Request {
  return { user } as Request;
}

const run = (middleware: ReturnType<typeof canAccess>, req: Request) => {
  const next = vi.fn() as NextFunction;
  middleware(req, {} as Response, next);
  return next;
};

describe("canAccess middleware", () => {
  it("no req.user -> 401", () => {
    expect(() => run(canAccess("read:user"), makeReq())).toThrow(
      UnauthorizedError,
    );
  });

  it("single feature held -> next()", () => {
    const next = run(
      canAccess("read:user"),
      makeReq(makeAuthUser(["read:user"])),
    );

    expect(next).toHaveBeenCalledWith();
  });

  it("single feature missing -> 403 naming it", () => {
    const action = forbiddenActionOf(
      canAccess("read:user"),
      makeReq(makeAuthUser(["read:session"])),
    );

    expect(action).toBe('Verifique se você tem acesso a feature "read:user"');
  });

  it("list form -> passes on ANY of the features (8.3)", () => {
    // A rota de perfil declara criar E reativar; ter só uma das duas basta para
    // entrar, porque o ramo só é conhecido depois de ler o banco.
    const next = run(
      canAccess(["create:customer-profile", "reactivate:customer-profile"]),
      makeReq(makeAuthUser(["reactivate:customer-profile"])),
    );

    expect(next).toHaveBeenCalledWith();
  });

  it("list form -> 403 naming all of them when none is held", () => {
    const action = forbiddenActionOf(
      canAccess(["create:employee-profile", "reactivate:employee-profile"]),
      makeReq(makeAuthUser(["read:user"])),
    );

    expect(action).toBe(
      'Verifique se você tem acesso a uma das features: "create:employee-profile", "reactivate:employee-profile"',
    );
  });

  it("list form -> the `:others` variant also opens the door", () => {
    // `can` casa o sufixo sozinho: o porteiro admite dono e privilegiado, e quem
    // separa os dois é o service.
    const next = run(
      canAccess(["create:customer-profile", "reactivate:customer-profile"]),
      makeReq(makeAuthUser(["create:customer-profile:others"])),
    );

    expect(next).toHaveBeenCalledWith();
  });

  it("wildcard holder passes anything", () => {
    const next = run(
      canAccess(["create:employee-profile", "reactivate:employee-profile"]),
      makeReq(makeAuthUser(["*"])),
    );

    expect(next).toHaveBeenCalledWith();
  });
});

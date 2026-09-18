import type { AuthUser } from "@/lib/authorization";

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

import { buildCustomer } from "@tests/factories/user.factory";
import { clearDatabase } from "@tests/helpers/database";
import { flushRedis } from "@tests/helpers/redis";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "@/app";
import { prisma } from "@/lib/prisma";

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));
vi.mock("@/lib/email", () => ({ send: sendMock }));

/**
 * O IP do visitante atravessa três cadeias diferentes até a API, e as três têm
 * de gravar o **mesmo** endereço — o dele, nunca o de quem repassou:
 *
 * 1. visitante → api            (sem proxy: quem abre a conexão é o visitante)
 * 2. visitante → nginx → api    (um salto)
 * 3. visitante → nginx → cliente → api (dois saltos; o cliente renderiza no
 *    servidor e acrescenta o próprio endereço ao header)
 *
 * Contagem de saltos não serve as três ao mesmo tempo — por isso a confiança é
 * por **endereço de origem** (`docs/adr/0123-trust-proxy-endereco-origem-nao-contagem-saltos.md`). O erro aqui é
 * silencioso: nada quebra, o rate limit passa a ser coletivo e o audit log
 * grava o container em vez do visitante. Daí o teste afirmar os **dois**
 * destinos do valor, `Session.ipAddress` e `AuditLog.ip`, e não `req.ip` por
 * uma rota de eco que só existiria para o teste.
 */
const VISITOR = "203.0.113.7";
/** O endereço que o container do cliente acrescenta ao repassar. */
const CLIENT_CONTAINER = "10.42.0.9";

/** Loopback, nas duas formas em que o Node pode entregá-lo. */
const LOOPBACK = /^(::1|(::ffff:)?127\.0\.0\.1)$/;

function post(path: string, forwardedFor?: string) {
  const pending = request(app).post(path);
  return forwardedFor ? pending.set("X-Forwarded-For", forwardedFor) : pending;
}

/** IP gravado na linha de sessão criada por um login que deu certo. */
async function ipOnSessionRow(
  credentials: { email: string; password: string },
  forwardedFor?: string,
): Promise<string | null> {
  const response = await post("/api/v1/auth/login", forwardedFor).send(
    credentials,
  );
  expect(response.status).toBe(200);

  const session = await prisma.session.findFirstOrThrow({
    orderBy: { createdAt: "desc" },
  });
  return session.ipAddress;
}

/** IP gravado na trilha por um login recusado (`AUTH_LOGIN_FAILED`). */
async function ipOnAuditRow(
  email: string,
  forwardedFor?: string,
): Promise<string | null> {
  const response = await post("/api/v1/auth/login", forwardedFor).send({
    email,
    password: "senha-errada-de-proposito",
  });
  expect(response.status).toBe(401);

  const entry = await prisma.auditLog.findFirstOrThrow({
    where: { action: "AUTH_LOGIN_FAILED" },
    orderBy: { createdAt: "desc" },
  });
  return entry.ip;
}

describe("IP do visitante — `trust proxy` por endereço de origem", () => {
  beforeEach(async () => {
    sendMock.mockReset();
    sendMock.mockResolvedValue(undefined);
    await clearDatabase();
    await flushRedis();
  });

  it("should record the caller's own address when nothing is forwarded", async () => {
    const user = await buildCustomer();
    const credentials = { email: user.email, password: user.password };

    expect(await ipOnSessionRow(credentials)).toMatch(LOOPBACK);
    expect(await ipOnAuditRow(user.email)).toMatch(LOOPBACK);
  });

  it("should record the visitor's address behind the reverse proxy (one hop)", async () => {
    const user = await buildCustomer();
    const credentials = { email: user.email, password: user.password };

    expect(await ipOnSessionRow(credentials, VISITOR)).toBe(VISITOR);
    expect(await ipOnAuditRow(user.email, VISITOR)).toBe(VISITOR);
  });

  // O cliente acrescentou o próprio salto em vez de copiar o header. As duas
  // formas valem, e é justamente isso que esta caso prova: nenhuma contagem
  // fixa acerta esta cadeia e a anterior ao mesmo tempo.
  it("should record the visitor's address behind a server-rendered client (two hops)", async () => {
    const user = await buildCustomer();
    const credentials = { email: user.email, password: user.password };
    const chain = `${VISITOR}, ${CLIENT_CONTAINER}`;

    expect(await ipOnSessionRow(credentials, chain)).toBe(VISITOR);
    expect(await ipOnAuditRow(user.email, chain)).toBe(VISITOR);
  });
});

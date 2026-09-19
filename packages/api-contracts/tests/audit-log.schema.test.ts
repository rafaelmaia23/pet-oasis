import { describe, expect, it } from "vitest";
import { AUDIT_TARGET_TYPES, listAuditLogsSchema } from "../src/audit-log";

/**
 * Guarda de regressão da 9.4: até então a lista de tipos de alvo existia duas
 * vezes — a union de `AuditTargetType` e um `z.enum([...])` escrito à mão no
 * schema do filtro. Acrescentar um alvo e esquecer o segundo não quebrava o
 * build; só fazia `?targetType=` recusar silenciosamente um valor legítimo.
 * Agora as duas derivam de `AUDIT_TARGET_TYPES`, e este teste prova o vínculo.
 */
describe("listAuditLogsSchema — filtro de targetType", () => {
  it.each(AUDIT_TARGET_TYPES)("accepts the declared target type %s", (type) => {
    const result = listAuditLogsSchema.safeParse({
      query: { targetType: type },
    });

    expect(result.success).toBe(true);
  });

  it("rejects a target type outside the taxonomy", () => {
    const result = listAuditLogsSchema.safeParse({
      query: { targetType: "Pets" },
    });

    expect(result.success).toBe(false);
  });
});

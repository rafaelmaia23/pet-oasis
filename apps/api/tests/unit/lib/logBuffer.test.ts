import { beforeEach, describe, expect, it } from "vitest";
import { env } from "@/config/env";
import { logBuffer, MAX_ENTRY_SIZE } from "@/lib/logBuffer";

describe("logBuffer", () => {
  beforeEach(() => {
    logBuffer.clear();
  });

  it("should list what was pushed, oldest first", () => {
    logBuffer.push({ msg: "primeiro" });
    logBuffer.push({ msg: "segundo" });

    expect(logBuffer.list()).toEqual([{ msg: "primeiro" }, { msg: "segundo" }]);
  });

  it("should never hold more than LOG_BUFFER_SIZE entries", () => {
    for (let i = 0; i < env.LOG_BUFFER_SIZE + 50; i++) {
      logBuffer.push({ i });
    }

    expect(logBuffer.list()).toHaveLength(env.LOG_BUFFER_SIZE);
  });

  it("should overwrite the oldest entry once full", () => {
    for (let i = 0; i < env.LOG_BUFFER_SIZE + 3; i++) {
      logBuffer.push({ i });
    }

    const entries = logBuffer.list() as { i: number }[];

    // As 3 primeiras (0,1,2) foram sobrescritas; a lista segue em ordem.
    expect(entries[0]?.i).toBe(3);
    expect(entries.at(-1)?.i).toBe(env.LOG_BUFFER_SIZE + 2);
  });

  it("should truncate an oversized entry instead of holding it whole", () => {
    logBuffer.push({ msg: "x".repeat(MAX_ENTRY_SIZE * 2) });

    const [entry] = logBuffer.list();

    expect(JSON.stringify(entry).length).toBeLessThanOrEqual(
      MAX_ENTRY_SIZE + 100,
    );
    expect(entry).toMatchObject({ truncated: true });
  });

  it("should accept an NDJSON line as a writable stream and store it parsed", () => {
    logBuffer.write(`${JSON.stringify({ level: 30, msg: "via stream" })}\n`);

    expect(logBuffer.list()).toEqual([{ level: 30, msg: "via stream" }]);
  });

  it("should drop a malformed line instead of throwing", () => {
    expect(() => logBuffer.write("isto não é json\n")).not.toThrow();
    expect(logBuffer.list()).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { describeUserAgent } from "@/lib/userAgent";

describe("describeUserAgent", () => {
  it("returns null-safe fallback when there is no User-Agent", () => {
    expect(describeUserAgent(null)).toBe("Dispositivo desconhecido");
  });

  it("returns fallback for an unrecognized User-Agent", () => {
    expect(describeUserAgent("curl/8.4.0")).toBe("Dispositivo desconhecido");
  });

  it("describes a desktop browser + OS pair", () => {
    const chromeOnWindows =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    expect(describeUserAgent(chromeOnWindows)).toBe("Chrome no Windows");
  });

  it("describes a mobile browser + OS pair", () => {
    const safariOnIos =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    expect(describeUserAgent(safariOnIos)).toBe("Mobile Safari no iOS");
  });
});

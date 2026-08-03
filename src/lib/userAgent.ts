import { UAParser } from "ua-parser-js";

const UNKNOWN_DEVICE = "Dispositivo desconhecido";

/** Human-readable device label from a raw User-Agent, e.g. "Chrome no Windows". */
export function describeUserAgent(userAgent: string | null): string {
  if (!userAgent) return UNKNOWN_DEVICE;

  const { browser, os } = UAParser(userAgent);

  if (!browser.name && !os.name) return UNKNOWN_DEVICE;
  if (!os.name) return browser.name ?? UNKNOWN_DEVICE;
  if (!browser.name) return `${UNKNOWN_DEVICE} no ${os.name}`;

  return `${browser.name} no ${os.name}`;
}

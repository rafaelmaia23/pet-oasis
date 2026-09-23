/**
 * Mascara o último segmento do IP (`192.168.1.42` → `192.168.1.***`) para quem
 * não tem `read:audit-log:full`. O dado permanece íntegro no banco; isto é só
 * serialização (docs/reference/logging-policy.md §5.3). `null` continua `null`; formato
 * não reconhecido vira `***`.
 *
 * A whitelist da view não está mais aqui: quem a aplica é o `registerRoute`, a
 * partir da view que a entrada da tabela declara. O que sobrou é o
 * mascaramento, que é decisão da API (qual viewer vê o quê), não forma de
 * resposta.
 */
export function maskIp(ip: string | null): string | null {
  if (!ip) return null;

  if (ip.includes(".")) {
    const parts = ip.split(".");
    parts[parts.length - 1] = "***";
    return parts.join(".");
  }

  if (ip.includes(":")) {
    const parts = ip.split(":");
    parts[parts.length - 1] = "***";
    return parts.join(":");
  }

  return "***";
}

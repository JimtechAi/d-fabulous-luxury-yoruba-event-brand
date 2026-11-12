// Pure, dependency-free IP validation/normalisation shared by the Supabase Edge Function and the
// Express backend (server/rateLimit.ts) so both implementations identify clients identically.
// It must not use Deno-only or Node-only APIs.

function parseIpv4(value: string): number[] | null {
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    octets.push(octet);
  }
  return octets;
}

function parseIpv6(value: string): number[] | null {
  let text = value.split('%')[0].toLowerCase();
  if (!text.includes(':') || !/^[0-9a-f:.]+$/.test(text)) return null;

  if (text.includes('.')) {
    const lastColon = text.lastIndexOf(':');
    const v4 = parseIpv4(text.slice(lastColon + 1));
    if (!v4) return null;
    text = `${text.slice(0, lastColon + 1)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }

  const halves = text.split('::');
  if (halves.length > 2) return null;
  const toGroups = (part: string): number[] | null => {
    if (part === '') return [];
    const groups: number[] = [];
    for (const group of part.split(':')) {
      if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
      groups.push(parseInt(group, 16));
    }
    return groups;
  };

  const head = toGroups(halves[0]);
  if (!head) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;

  const tail = toGroups(halves[1]);
  if (!tail || head.length + tail.length > 7) return null;
  return [...head, ...new Array<number>(8 - head.length - tail.length).fill(0), ...tail];
}

/**
 * Validates and canonicalises an IP address string. Returns null for anything that is not a
 * well-formed IPv4/IPv6 address. IPv4-mapped IPv6 addresses collapse to IPv4; other IPv6
 * addresses collapse to their /64 prefix so a single host cannot rotate through its prefix.
 */
export function normalizeIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let value = raw.trim();
  if (value.startsWith('[') && value.endsWith(']')) value = value.slice(1, -1);
  if (!value || value.length > 45) return null;

  const v4 = parseIpv4(value);
  if (v4) return `4:${v4.join('.')}`;

  const v6 = parseIpv6(value);
  if (!v6) return null;
  if (v6.slice(0, 5).every((group) => group === 0) && v6[5] === 0xffff) {
    return `4:${[v6[6] >> 8, v6[6] & 255, v6[7] >> 8, v6[7] & 255].join('.')}`;
  }
  return `6:${v6.slice(0, 4).map((group) => group.toString(16)).join(':')}`;
}

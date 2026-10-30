// Days in the shop's timezone (Section 4: stored in UTC, reported in the shop's zone,
// default Asia/Manila). Uses Intl, so any IANA zone works, including ones with DST.

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Minutes the zone is ahead of UTC at that moment (Manila: +480). */
export function zoneOffsetMinutes(timeZone: string, atMs: number): number {
  const p = Object.fromEntries(
    partsFormatter(timeZone)
      .formatToParts(new Date(atMs))
      .map((x) => [x.type, x.value]),
  );
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return Math.round((asUtc - Math.floor(atMs / 1000) * 1000) / 60_000);
}

/** The local date of a moment, as 'YYYY-MM-DD'. */
export function localDay(atMs: number, timeZone: string): string {
  return new Date(atMs + zoneOffsetMinutes(timeZone, atMs) * 60_000).toISOString().slice(0, 10);
}

/** When a local day starts, in UTC milliseconds. */
export function dayStartMs(day: string, timeZone: string): number {
  const midnightUtc = Date.parse(`${day}T00:00:00Z`);
  // Twice, so a DST change near midnight still lands on the right instant.
  let start = midnightUtc - zoneOffsetMinutes(timeZone, midnightUtc) * 60_000;
  start = midnightUtc - zoneOffsetMinutes(timeZone, start) * 60_000;
  return start;
}

/** 'YYYY-MM-DD' plus n days. */
export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Every day from `from` to `to`, inclusive. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    partsFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

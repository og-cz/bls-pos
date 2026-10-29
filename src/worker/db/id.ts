// State for monotonic ids within this isolate (RFC 9562 §6.2, method 1).
let lastMs = -1;
let seq = 0;

/**
 * UUIDv7 (RFC 9562): 48-bit Unix ms timestamp, a 12-bit counter, then 62 random bits.
 * Time-ordered, so new rows append to the end of indexes, but not guessable. Ids made in
 * the same millisecond still sort in the order they were made (the counter starts at a
 * random value and counts up), which keeps "newest first" lists such as the audit log
 * in true order. If the clock goes backwards, the last timestamp is reused.
 */
export function newId(now: number = Date.now()): string {
  let ms = now;
  if (ms <= lastMs) {
    ms = lastMs;
    seq += 1;
    if (seq > 0xfff) {
      // Counter used up for this millisecond: borrow the next one.
      ms = lastMs + 1;
      seq = 0;
    }
  } else {
    seq = (crypto.getRandomValues(new Uint16Array(1))[0] ?? 0) & 0x7ff; // leaves room to count
  }
  lastMs = ms;

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let ts = ms;
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ts & 0xff;
    ts = Math.floor(ts / 256);
  }
  bytes[6] = 0x70 | (seq >> 8); // version 7 + counter high bits
  bytes[7] = seq & 0xff;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

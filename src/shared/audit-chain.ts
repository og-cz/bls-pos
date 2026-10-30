// Tamper-evident activity log (Section 7.16). Each sealed entry's hash covers the previous
// entry's hash and every field of its own, so changing or deleting a sealed entry breaks
// the chain from that point. The same code seals on the server and checks in the browser.

export type ChainEntry = {
  id: string;
  shopId: string;
  userId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  detailsJson: string | null;
  ipHash: string | null;
  createdAt: number;
  chainSeq: number;
  chainHash: string;
};

/** The genesis value before a shop's first entry. */
export const CHAIN_START = '0'.repeat(64);

/** Every field, in a fixed order, as one string. */
export function canonicalEntry(e: Omit<ChainEntry, 'chainHash'>): string {
  return JSON.stringify([
    e.chainSeq,
    e.id,
    e.shopId,
    e.userId,
    e.action,
    e.targetType,
    e.targetId,
    e.detailsJson,
    e.ipHash,
    e.createdAt,
  ]);
}

/** SHA-256 as lowercase hex. Passed in: the server and the browser each have their own. */
export type Sha256Hex = (text: string) => Promise<string>;

export function chainHash(
  sha256: Sha256Hex,
  prev: string,
  entry: Omit<ChainEntry, 'chainHash'>,
): Promise<string> {
  return sha256(`${prev}\n${canonicalEntry(entry)}`);
}

export type ChainCheck =
  | { ok: true; checked: number; head: string }
  | { ok: false; checked: number; brokenAt: number; reason: 'changed' | 'missing' };

/**
 * Checks a run of sealed entries, in chain order, continuing from `prev` (the hash of the
 * entry before `expectedSeq`). Reports the first entry that was changed, or a gap where
 * entries were removed.
 */
export async function verifyChain(
  sha256: Sha256Hex,
  entries: ChainEntry[],
  prev: string = CHAIN_START,
  expectedSeq = 1,
): Promise<ChainCheck> {
  let hash = prev;
  let seq = expectedSeq;
  for (const e of entries) {
    if (e.chainSeq !== seq)
      return { ok: false, checked: seq - expectedSeq, brokenAt: seq, reason: 'missing' };
    const expected = await chainHash(sha256, hash, e);
    if (expected !== e.chainHash) {
      return { ok: false, checked: seq - expectedSeq, brokenAt: seq, reason: 'changed' };
    }
    hash = e.chainHash;
    seq += 1;
  }
  return { ok: true, checked: seq - expectedSeq, head: hash };
}

import { CHAIN_START, chainHash } from '@shared/audit-chain';

import { sha256Hex } from './security/tokens';

// Seals new activity-log entries into each shop's hash chain (Section 7.16). Runs with
// the hourly backups. Sealing after the fact (instead of on every write) keeps the chain
// in one strict order even when two requests log at the same moment; entries are sealed
// within the hour.

/** At most this many entries per run, to stay well inside the Cron CPU limit. */
export const SEAL_BATCH = 300;

type Row = {
  id: string;
  shop_id: string;
  user_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details_json: string | null;
  ip_hash: string | null;
  created_at: number;
};

export async function sealAuditLog(env: Env): Promise<number> {
  const { results } = await env.DB.prepare(
    `SELECT id, shop_id, user_id, action, target_type, target_id, details_json, ip_hash, created_at
     FROM audit_log WHERE chain_seq IS NULL ORDER BY shop_id, id LIMIT ?1`,
  )
    .bind(SEAL_BATCH)
    .all<Row>();
  if (results.length === 0) return 0;

  // Each shop's chain head: its last sealed entry.
  const shopIds = [...new Set(results.map((r) => r.shop_id))];
  const heads = await env.DB.prepare(
    `SELECT a.shop_id, a.chain_seq, a.chain_hash FROM audit_log a
     JOIN (SELECT shop_id, max(chain_seq) AS seq FROM audit_log
           WHERE shop_id IN (SELECT value FROM json_each(?1)) AND chain_seq IS NOT NULL
           GROUP BY shop_id) h ON h.shop_id = a.shop_id AND h.seq = a.chain_seq`,
  )
    .bind(JSON.stringify(shopIds))
    .all<{ shop_id: string; chain_seq: number; chain_hash: string }>();
  const head = new Map(
    heads.results.map((h) => [h.shop_id, { seq: h.chain_seq, hash: h.chain_hash }]),
  );

  const updates: D1PreparedStatement[] = [];
  for (const r of results) {
    const prev = head.get(r.shop_id) ?? { seq: 0, hash: CHAIN_START };
    const seq = prev.seq + 1;
    const hash = await chainHash(sha256Hex, prev.hash, {
      id: r.id,
      shopId: r.shop_id,
      userId: r.user_id,
      action: r.action,
      targetType: r.target_type,
      targetId: r.target_id,
      detailsJson: r.details_json,
      ipHash: r.ip_hash,
      createdAt: r.created_at,
      chainSeq: seq,
    });
    head.set(r.shop_id, { seq, hash });
    // "chain_seq IS NULL": a second run at the same time can never seal it twice.
    updates.push(
      env.DB.prepare(
        'UPDATE audit_log SET chain_seq = ?2, chain_hash = ?3 WHERE id = ?1 AND chain_seq IS NULL',
      ).bind(r.id, seq, hash),
    );
  }
  await env.DB.batch(updates);
  return results.length;
}

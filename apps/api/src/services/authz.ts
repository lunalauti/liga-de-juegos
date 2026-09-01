import { db } from '../db.js';
import { forbidden } from '../errors.js';

/** Compartido entre routes/groups.ts, routes/entries.ts y routes/entriesImport.ts. */
export async function getMembership(groupId: string, userId: string) {
  const r = await db.query(
    `select role from public.group_members where group_id = $1 and user_id = $2`,
    [groupId, userId],
  );
  return r.rows[0] as { role: 'admin' | 'member' } | undefined;
}

export async function requireMember(groupId: string, userId: string) {
  const m = await getMembership(groupId, userId);
  if (!m) throw forbidden('No sos parte de este grupo');
  return m;
}

export async function requireAdmin(groupId: string, userId: string) {
  const m = await requireMember(groupId, userId);
  if (m.role !== 'admin') throw forbidden('Sólo el admin del grupo puede hacer esto');
  return m;
}

import { kv } from '@vercel/kv';

const VALID_TRANSITIONS = {
  draft:      ['in_review', 'draft'],
  in_review:  ['approved', 'rejected', 'draft'],
  rejected:   ['draft'],
  approved:   ['scheduled', 'published'],
  scheduled:  ['published', 'approved'],
  published:  [],
};

export function applyStatusTransition(current, next) {
  if (!VALID_TRANSITIONS[current]?.includes(next)) {
    throw new Error(`invalid status transition: ${current} -> ${next}`);
  }
  return next;
}

export default async function handler(req, res) {
  const { id } = req.query;
  const item = await kv.get(`content:${id}`);
  if (!item) return res.status(404).json({ error: 'Not found' });

  if (req.method === 'GET') {
    return res.json(item);
  }

  if (req.method === 'PUT') {
    const updates = { ...req.body };
    if (updates.status && updates.status !== item.status) {
      try {
        applyStatusTransition(item.status, updates.status);
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
    }
    const updated = { ...item, ...updates, updatedAt: new Date().toISOString() };
    await kv.set(`content:${id}`, updated);
    return res.json(updated);
  }

  if (req.method === 'DELETE') {
    await kv.del(`content:${id}`);
    const ids = await kv.lrange('content:index', 0, -1);
    await kv.del('content:index');
    const remaining = ids.filter(i => i !== id);
    if (remaining.length) await kv.rpush('content:index', ...remaining);
    return res.status(204).end();
  }

  res.status(405).json({ error: 'Method not allowed' });
}

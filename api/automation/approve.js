import { kv } from '@vercel/kv';
import { jwtVerify } from 'jose';

const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? 'dev-secret-replace-in-production');
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

const TERMINAL_STATUSES = ['approved', 'rejected', 'published', 'timed_out', 'auto_published'];

// GET /api/automation/approve?token=<jwt> — email link click
// POST /api/automation/approve — Telegram webhook / manual / timeout
export default async function handler(req, res) {
  let jobId, action, channel;

  if (req.method === 'GET') {
    // Email link: /api/automation/approve?token=<jwt>
    try {
      const { payload } = await jwtVerify(req.query.token, secret);
      jobId = payload.jobId;
      action = payload.action;
      channel = 'email';
    } catch {
      return res.status(400).send('<h2>Invalid or expired approval link.</h2>');
    }
  } else if (req.method === 'POST') {
    ({ jobId, action, channel } = req.body);
    if (!jobId || !action) return res.status(400).json({ error: 'jobId and action required' });
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const job = await kv.get(`automation:job:${jobId}`);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (TERMINAL_STATUSES.includes(job.status)) {
    return res.status(409).json({ error: `Job already ${job.status}` });
  }

  const now = new Date().toISOString();

  if (action === 'approve') {
    const updated = { ...job, status: 'approved', approvedAt: now, approvedBy: channel, updatedAt: now };
    await kv.set(`automation:job:${jobId}`, updated);

    // Trigger publish via existing endpoint
    const rule = await kv.get(`automation:rule:${job.ruleId}`);
    if (rule?.publish?.wordpress) {
      try {
        const publishRes = await fetch(`${APP_URL}/api/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: job.contentId }),
        });
        if (publishRes.ok) {
          await kv.set(`automation:job:${jobId}`, { ...updated, status: 'published' });
        } else {
          console.error('Publish after approval failed: HTTP', publishRes.status);
        }
      } catch (err) {
        // Publish failed — job stays 'approved', not 'published'
        console.error('Publish after approval failed:', err.message);
      }
    }

    if (req.method === 'GET') return res.redirect(302, `${APP_URL}?approved=1`);
    return res.status(200).json({ status: 'approved', jobId });
  }

  if (action === 'reject') {
    await kv.set(`automation:job:${jobId}`, {
      ...job, status: 'rejected', rejectedAt: now, approvedBy: channel, updatedAt: now,
    });
    if (req.method === 'GET') return res.redirect(302, `${APP_URL}?rejected=1`);
    return res.status(200).json({ status: 'rejected', jobId });
  }

  return res.status(400).json({ error: 'action must be approve or reject' });
}

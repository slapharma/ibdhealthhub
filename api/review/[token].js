import { kv } from '@vercel/kv';
import { parseApprovalToken } from '../review/send.js';

export function computeNewStatus(item) {
  if (item.rejections.length > 0) return 'rejected';
  if (item.requireAllApprovals) {
    return item.approvals.length >= item.reviewers.length ? 'approved' : 'in_review';
  }
  return item.approvals.length > 0 ? 'approved' : 'in_review';
}

const page = (emoji, title, message) => `<!DOCTYPE html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — SLA Health</title>
<style>
  body{font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;
       min-height:100vh;margin:0;background:#f0f2f5;}
  .card{max-width:440px;text-align:center;padding:40px 32px;background:#fff;
        border-radius:12px;box-shadow:0 2px 20px rgba(30,45,64,.1);}
  h1{color:#1e2d40;font-size:1.5rem;margin:8px 0 12px;}
  p{color:#555;line-height:1.6;margin:0 0 12px;}
  a{color:#F47920;font-weight:bold;}
  .brand{color:#1e2d40;font-weight:800;font-size:18px;letter-spacing:1px;margin-bottom:24px;display:block;}
  .brand span{color:#F47920;}
</style></head><body>
<div class="card">
  <span class="brand">SLA Health<span> ■</span></span>
  <div style="font-size:3rem;margin-bottom:8px;">${emoji}</div>
  <h1>${title}</h1>
  <p>${message}</p>
  <p><a href="/">Return to app →</a></p>
</div></body></html>`;

export default async function handler(req, res) {
  const { token } = req.query;

  let payload;
  try {
    payload = await parseApprovalToken(token);
  } catch {
    res.setHeader('Content-Type', 'text/html');
    return res.status(400).send(page('⚠️', 'Link expired', 'This approval link has expired or is invalid. Please ask for a new review request.'));
  }

  const { contentId, reviewerId, action } = payload;
  const item = await kv.get(`content:${contentId}`);

  if (!item) {
    res.setHeader('Content-Type', 'text/html');
    return res.status(404).send(page('🔍', 'Not found', 'This content item no longer exists.'));
  }

  const alreadyVoted = item.approvals.includes(reviewerId) || item.rejections.includes(reviewerId);
  if (alreadyVoted) {
    res.setHeader('Content-Type', 'text/html');
    return res.send(page('✓', 'Already recorded', 'Your response has already been recorded. Thank you!'));
  }

  if (action === 'approve') item.approvals.push(reviewerId);
  else item.rejections.push(reviewerId);

  item.status = computeNewStatus(item);
  item.updatedAt = new Date().toISOString();
  await kv.set(`content:${contentId}`, item);

  const isApprove = action === 'approve';
  res.setHeader('Content-Type', 'text/html');
  return res.send(page(
    isApprove ? '✅' : '↩️',
    isApprove ? 'Approved!' : 'Changes Requested',
    isApprove
      ? `You approved <strong>${item.title}</strong>. ${item.status === 'approved' ? 'It is now approved and ready to schedule.' : 'Waiting for remaining reviewers.'}`
      : `You requested changes to <strong>${item.title}</strong>. The author will be notified.`
  ));
}

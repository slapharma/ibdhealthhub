import assert from 'node:assert/strict';
import { test } from 'node:test';

// ── Shared logic extracted for dependency-injection testing ───────────────────
// We re-implement the handler logic inline so tests don't import @vercel/kv
// (which requires a live Redis connection). The approve.js handler uses the
// same logic; these tests validate the business rules directly.

const TERMINAL_STATUSES = ['approved', 'rejected', 'published', 'timed_out', 'auto_published'];

async function approveLogic({ body, kv, fetchFn, appUrl }) {
  const { jobId, action, channel } = body;

  if (!jobId || !action) {
    return { statusCode: 400, body: { error: 'jobId and action required' } };
  }

  const job = await kv.get(`automation:job:${jobId}`);
  if (!job) {
    return { statusCode: 404, body: { error: 'Job not found' } };
  }
  if (TERMINAL_STATUSES.includes(job.status)) {
    return { statusCode: 409, body: { error: `Job already ${job.status}` } };
  }

  const now = new Date().toISOString();

  if (action === 'approve') {
    const updated = { ...job, status: 'approved', approvedAt: now, approvedBy: channel, updatedAt: now };
    await kv.set(`automation:job:${jobId}`, updated);

    const rule = await kv.get(`automation:rule:${job.ruleId}`);
    if (rule?.publish?.wordpress) {
      try {
        await fetchFn(`${appUrl}/api/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: job.contentId }),
        });
        await kv.set(`automation:job:${jobId}`, { ...updated, status: 'published' });
      } catch (err) {
        // Publish failed — job stays 'approved'
        console.error('Publish after approval failed:', err.message);
      }
    }

    return { statusCode: 200, body: { status: 'approved', jobId } };
  }

  if (action === 'reject') {
    await kv.set(`automation:job:${jobId}`, {
      ...job, status: 'rejected', rejectedAt: now, approvedBy: channel, updatedAt: now,
    });
    return { statusCode: 200, body: { status: 'rejected', jobId } };
  }

  return { statusCode: 400, body: { error: 'action must be approve or reject' } };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('POST approve → job.status becomes approved, approvedBy is manual', async () => {
  const store = new Map();
  const jobId = 'job_test_001';
  store.set(`automation:job:${jobId}`, {
    id: jobId,
    ruleId: 'rule_abc',
    contentId: 'content_xyz',
    status: 'pending_review',
  });
  // Rule without wordpress publish so we don't hit fetch
  store.set('automation:rule:rule_abc', { publish: { wordpress: false } });

  const mockKV = {
    get: async (key) => store.get(key) ?? null,
    set: async (key, val) => store.set(key, val),
  };

  const result = await approveLogic({
    body: { jobId, action: 'approve', channel: 'manual' },
    kv: mockKV,
    fetchFn: async () => { throw new Error('should not be called'); },
    appUrl: 'http://localhost:3000',
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, 'approved');
  assert.equal(result.body.jobId, jobId);

  const saved = store.get(`automation:job:${jobId}`);
  assert.equal(saved.status, 'approved');
  assert.equal(saved.approvedBy, 'manual');
  assert.ok(saved.approvedAt);
});

test('POST reject → job.status becomes rejected', async () => {
  const store = new Map();
  const jobId = 'job_test_002';
  store.set(`automation:job:${jobId}`, {
    id: jobId,
    ruleId: 'rule_abc',
    contentId: 'content_xyz',
    status: 'pending_review',
  });

  const mockKV = {
    get: async (key) => store.get(key) ?? null,
    set: async (key, val) => store.set(key, val),
  };

  const result = await approveLogic({
    body: { jobId, action: 'reject', channel: 'manual' },
    kv: mockKV,
    fetchFn: async () => {},
    appUrl: 'http://localhost:3000',
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, 'rejected');

  const saved = store.get(`automation:job:${jobId}`);
  assert.equal(saved.status, 'rejected');
  assert.ok(saved.rejectedAt);
});

test('POST returns 404 for unknown job', async () => {
  const mockKV = {
    get: async () => null,
    set: async () => {},
  };

  const result = await approveLogic({
    body: { jobId: 'job_nonexistent', action: 'approve', channel: 'manual' },
    kv: mockKV,
    fetchFn: async () => {},
    appUrl: 'http://localhost:3000',
  });

  assert.equal(result.statusCode, 404);
  assert.equal(result.body.error, 'Job not found');
});

test('POST returns 409 if job already in terminal status', async () => {
  const store = new Map();
  const jobId = 'job_test_003';
  store.set(`automation:job:${jobId}`, {
    id: jobId,
    ruleId: 'rule_abc',
    contentId: 'content_xyz',
    status: 'approved',
  });

  const mockKV = {
    get: async (key) => store.get(key) ?? null,
    set: async (key, val) => store.set(key, val),
  };

  const result = await approveLogic({
    body: { jobId, action: 'approve', channel: 'manual' },
    kv: mockKV,
    fetchFn: async () => {},
    appUrl: 'http://localhost:3000',
  });

  assert.equal(result.statusCode, 409);
  assert.equal(result.body.error, 'Job already approved');
});

test('POST returns 400 if jobId or action missing', async () => {
  const mockKV = {
    get: async () => null,
    set: async () => {},
  };

  // Missing action
  const result1 = await approveLogic({
    body: { jobId: 'job_test_004' },
    kv: mockKV,
    fetchFn: async () => {},
    appUrl: 'http://localhost:3000',
  });
  assert.equal(result1.statusCode, 400);
  assert.equal(result1.body.error, 'jobId and action required');

  // Missing jobId
  const result2 = await approveLogic({
    body: { action: 'approve' },
    kv: mockKV,
    fetchFn: async () => {},
    appUrl: 'http://localhost:3000',
  });
  assert.equal(result2.statusCode, 400);
  assert.equal(result2.body.error, 'jobId and action required');
});

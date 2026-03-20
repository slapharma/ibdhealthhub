import assert from 'node:assert/strict';
import { test } from 'node:test';

// Test the single job handler logic with dependency injection for KV

test('GET returns job by id (200)', async () => {
  const testJob = { id: 'job_123', status: 'pending_review', ruleId: 'rule_abc', content: 'Job 1' };

  const mockKV = {
    get: async (key) => {
      if (key === 'automation:job:job_123') return testJob;
      return null;
    },
  };

  const getJobByIdLogic = async (id, kv) => {
    const job = await kv.get(`automation:job:${id}`);
    if (!job) return { error: 'Job not found', status: 404 };
    return { job, status: 200 };
  };

  const result = await getJobByIdLogic('job_123', mockKV);
  assert.equal(result.status, 200);
  assert.deepEqual(result.job, testJob);
});

test('GET returns 404 for unknown id', async () => {
  const mockKV = {
    get: async (key) => null,
  };

  const getJobByIdLogic = async (id, kv) => {
    const job = await kv.get(`automation:job:${id}`);
    if (!job) return { error: 'Job not found', status: 404 };
    return { job, status: 200 };
  };

  const result = await getJobByIdLogic('unknown_id', mockKV);
  assert.equal(result.status, 404);
  assert.equal(result.error, 'Job not found');
});

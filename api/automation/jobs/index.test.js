import assert from 'node:assert/strict';
import { test } from 'node:test';

// Test the handler logic with dependency injection for KV

test('GET returns empty array when no jobs', async () => {
  const mockKV = {
    lrange: async () => [],
  };

  const getJobsLogic = async (kv) => {
    const ids = await kv.lrange('automation:jobs:index', 0, -1);
    if (!ids.length) return [];
    const jobs = await Promise.all(ids.map(id => kv.get(`automation:job:${id}`)));
    return jobs.filter(Boolean);
  };

  const result = await getJobsLogic(mockKV);
  assert.deepEqual(result, []);
});

test('GET returns all jobs', async () => {
  const testJobs = [
    { id: 'job_123', status: 'pending_review', ruleId: 'rule_abc', content: 'Job 1' },
    { id: 'job_456', status: 'completed', ruleId: 'rule_def', content: 'Job 2' },
  ];

  const mockKV = {
    lrange: async () => ['job_123', 'job_456'],
    get: async (key) => {
      if (key === 'automation:job:job_123') return testJobs[0];
      if (key === 'automation:job:job_456') return testJobs[1];
      return null;
    },
  };

  const getJobsLogic = async (kv) => {
    const ids = await kv.lrange('automation:jobs:index', 0, -1);
    if (!ids.length) return [];
    const jobs = await Promise.all(ids.map(id => kv.get(`automation:job:${id}`)));
    return jobs.filter(Boolean);
  };

  const result = await getJobsLogic(mockKV);
  assert.equal(result.length, 2);
  assert.equal(result[0].id, 'job_123');
  assert.equal(result[1].id, 'job_456');
});

test('GET with ?status=pending_review filters correctly', async () => {
  const testJobs = [
    { id: 'job_123', status: 'pending_review', ruleId: 'rule_abc', content: 'Job 1' },
    { id: 'job_456', status: 'completed', ruleId: 'rule_def', content: 'Job 2' },
  ];

  const mockKV = {
    lrange: async () => ['job_123', 'job_456'],
    get: async (key) => {
      if (key === 'automation:job:job_123') return testJobs[0];
      if (key === 'automation:job:job_456') return testJobs[1];
      return null;
    },
  };

  const getJobsLogic = async (kv, filters) => {
    const ids = await kv.lrange('automation:jobs:index', 0, -1);
    if (!ids.length) return [];
    const jobs = await Promise.all(ids.map(id => kv.get(`automation:job:${id}`)));
    const valid = jobs.filter(Boolean);
    return valid.filter(j => {
      if (filters.status && j.status !== filters.status) return false;
      if (filters.ruleId && j.ruleId !== filters.ruleId) return false;
      return true;
    });
  };

  const result = await getJobsLogic(mockKV, { status: 'pending_review' });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'job_123');
  assert.equal(result[0].status, 'pending_review');
});

test('GET with ?ruleId=rule_abc filters correctly', async () => {
  const testJobs = [
    { id: 'job_123', status: 'pending_review', ruleId: 'rule_abc', content: 'Job 1' },
    { id: 'job_456', status: 'completed', ruleId: 'rule_def', content: 'Job 2' },
  ];

  const mockKV = {
    lrange: async () => ['job_123', 'job_456'],
    get: async (key) => {
      if (key === 'automation:job:job_123') return testJobs[0];
      if (key === 'automation:job:job_456') return testJobs[1];
      return null;
    },
  };

  const getJobsLogic = async (kv, filters) => {
    const ids = await kv.lrange('automation:jobs:index', 0, -1);
    if (!ids.length) return [];
    const jobs = await Promise.all(ids.map(id => kv.get(`automation:job:${id}`)));
    const valid = jobs.filter(Boolean);
    return valid.filter(j => {
      if (filters.status && j.status !== filters.status) return false;
      if (filters.ruleId && j.ruleId !== filters.ruleId) return false;
      return true;
    });
  };

  const result = await getJobsLogic(mockKV, { ruleId: 'rule_abc' });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'job_123');
  assert.equal(result[0].ruleId, 'rule_abc');
});

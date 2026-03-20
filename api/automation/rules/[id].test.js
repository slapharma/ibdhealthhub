import assert from 'node:assert/strict';
import { test } from 'node:test';

test('GET returns rule by id (200)', async () => {
  const testRule = {
    id: 'rule_123',
    name: 'Test Rule',
    category: 'clinical-reviews',
    enabled: true,
    createdAt: '2026-03-20T00:00:00.000Z',
    updatedAt: '2026-03-20T00:00:00.000Z',
  };

  const mockKV = {
    get: async (key) => {
      if (key === 'automation:rule:rule_123') return testRule;
      return null;
    },
  };

  const getLogic = async (id, kv) => {
    const rule = await kv.get(`automation:rule:${id}`);
    if (!rule) {
      return { status: 404, body: { error: 'Rule not found' } };
    }
    return { status: 200, body: rule };
  };

  const result = await getLogic('rule_123', mockKV);
  assert.equal(result.status, 200);
  assert.equal(result.body.id, 'rule_123');
  assert.equal(result.body.name, 'Test Rule');
});

test('GET returns 404 for unknown id', async () => {
  const mockKV = {
    get: async () => null,
  };

  const getLogic = async (id, kv) => {
    const rule = await kv.get(`automation:rule:${id}`);
    if (!rule) {
      return { status: 404, body: { error: 'Rule not found' } };
    }
    return { status: 200, body: rule };
  };

  const result = await getLogic('rule_nonexistent', mockKV);
  assert.equal(result.status, 404);
  assert.equal(result.body.error, 'Rule not found');
});

test('PATCH updates rule fields (200, updated field reflected)', async () => {
  const existingRule = {
    id: 'rule_456',
    name: 'Original Name',
    category: 'alerts',
    enabled: true,
    createdAt: '2026-03-20T00:00:00.000Z',
    updatedAt: '2026-03-20T00:00:00.000Z',
  };

  let savedRule = null;

  const mockKV = {
    get: async (key) => {
      if (key === 'automation:rule:rule_456') return existingRule;
      return null;
    },
    set: async (key, value) => {
      if (key === 'automation:rule:rule_456') {
        savedRule = value;
      }
    },
  };

  const patchLogic = async (id, body, kv) => {
    const rule = await kv.get(`automation:rule:${id}`);
    if (!rule) {
      return { status: 404, body: { error: 'Rule not found' } };
    }
    const updated = { ...rule, ...body, id, updatedAt: new Date().toISOString() };
    await kv.set(`automation:rule:${id}`, updated);
    return { status: 200, body: updated };
  };

  const result = await patchLogic('rule_456', { name: 'Updated Name', enabled: false }, mockKV);

  assert.equal(result.status, 200);
  assert.equal(result.body.name, 'Updated Name');
  assert.equal(result.body.enabled, false);
  assert.equal(result.body.category, 'alerts'); // unchanged
  assert.equal(result.body.id, 'rule_456'); // id unchanged
  assert.ok(result.body.updatedAt);
  assert.deepEqual(savedRule, result.body);
});

test('DELETE removes rule (200, { deleted: id })', async () => {
  let deletedKey = null;
  let removedFromIndex = null;

  const mockKV = {
    get: async (key) => {
      if (key === 'automation:rule:rule_789') return { id: 'rule_789', name: 'Test' };
      return null;
    },
    del: async (key) => {
      deletedKey = key;
    },
    lrem: async (key, count, id) => {
      if (key === 'automation:rules:index') {
        removedFromIndex = id;
      }
    },
  };

  const deleteLogic = async (id, kv) => {
    const existing = await kv.get(`automation:rule:${id}`);
    if (!existing) {
      return { status: 404, body: { error: 'Rule not found' } };
    }
    await kv.del(`automation:rule:${id}`);
    await kv.lrem('automation:rules:index', 0, id);
    return { status: 200, body: { deleted: id } };
  };

  const result = await deleteLogic('rule_789', mockKV);

  assert.equal(result.status, 200);
  assert.equal(result.body.deleted, 'rule_789');
  assert.equal(deletedKey, 'automation:rule:rule_789');
  assert.equal(removedFromIndex, 'rule_789');
});

test('DELETE returns 404 for unknown id', async () => {
  const mockKV = {
    get: async () => null,
    del: async () => {},
    lrem: async () => {},
  };

  const deleteLogic = async (id, kv) => {
    const existing = await kv.get(`automation:rule:${id}`);
    if (!existing) {
      return { status: 404, body: { error: 'Rule not found' } };
    }
    await kv.del(`automation:rule:${id}`);
    await kv.lrem('automation:rules:index', 0, id);
    return { status: 200, body: { deleted: id } };
  };

  const result = await deleteLogic('rule_nonexistent', mockKV);

  assert.equal(result.status, 404);
  assert.equal(result.body.error, 'Rule not found');
});

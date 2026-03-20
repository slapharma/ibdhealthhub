import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildJob, validateJob } from './job-schema.js';

test('buildJob sets id with job_ prefix', () => {
  const job = buildJob({
    ruleId: 'r1',
    contentId: 'c1',
  });
  assert.match(job.id, /^job_/);
  assert.equal(job.ruleId, 'r1');   // verify ruleId passthrough
  assert.equal(job.contentId, 'c1');  // verify contentId passthrough
});

test('buildJob sets default status to pending_review', () => {
  const job = buildJob({
    ruleId: 'r1',
    contentId: 'c1',
  });
  assert.equal(job.status, 'pending_review');
});

test('buildJob sets approvedBy to null by default', () => {
  const job = buildJob({
    ruleId: 'r1',
    contentId: 'c1',
  });
  assert.equal(job.approvedBy, null);
});

test('buildJob sets createdAt to truthy value', () => {
  const job = buildJob({
    ruleId: 'r1',
    contentId: 'c1',
  });
  assert.ok(job.createdAt);
});

test('buildJob accepts custom status', () => {
  const job = buildJob({
    ruleId: 'r1',
    contentId: 'c1',
    status: 'auto_published',
  });
  assert.equal(job.status, 'auto_published');
});

test('validateJob throws on missing ruleId', () => {
  assert.throws(() => validateJob({ contentId: 'c1' }), { message: 'ruleId is required' });
});

test('validateJob throws on missing contentId', () => {
  assert.throws(() => validateJob({ ruleId: 'r1' }), { message: 'contentId is required' });
});

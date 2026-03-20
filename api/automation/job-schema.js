import { randomUUID } from 'crypto';

export function validateJob(data) {
  if (!data.ruleId) throw new Error('ruleId is required');
  if (!data.contentId) throw new Error('contentId is required');
}

export function buildJob(data) {
  validateJob(data);
  const now = new Date().toISOString();
  return {
    id: `job_${randomUUID()}`,
    ruleId: data.ruleId,
    contentId: data.contentId,
    status: data.status ?? 'pending_review',
    notifiedAt: data.notifiedAt ?? null,
    approvedAt: null,
    rejectedAt: null,
    approvedBy: null,   // 'telegram' | 'email' | 'timeout' | 'manual'
    createdAt: now,
    updatedAt: now,
  };
}

// lib/automation/handlers/run.js
import { kv } from '@vercel/kv';
import cronParser from 'cron-parser';
const { CronExpressionParser } = cronParser;
import { fetchSources } from '../fetch.js';
import { buildJob } from '../job-schema.js';
import { sendNotifications } from '../notify.js';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
const TERMINAL_STATUSES = ['approved', 'rejected', 'published', 'timed_out', 'auto_published'];

// ── Cron evaluation helpers (exported for testing) ────────────────────────────

export function evaluateCron(cronExpression, lastRunAt, now) {
  try {
    const interval = CronExpressionParser.parse(cronExpression, {
      currentDate: new Date(now),
    });
    const prev = interval.prev();
    const iso = prev.toISOString();
    if (!iso) return false;
    const prevDate = new Date(iso);
    const sinceDate = lastRunAt ? new Date(lastRunAt) : new Date(0);
    return prevDate > sinceDate;
  } catch {
    return false;
  }
}

export function isRuleDue(rule, now) {
  if (!rule.enabled) return false;
  const { trigger, lastRunAt } = rule;

  if (trigger.type === 'schedule') {
    return evaluateCron(trigger.cron, lastRunAt, now);
  }
  if (trigger.type === 'event') {
    // Event-driven: check on every cron tick, enforcing minGapHours
    if (!lastRunAt) return true;
    const gap = (new Date(now) - new Date(lastRunAt)) / (1000 * 60 * 60);
    return gap >= (trigger.minGapHours ?? 4);
  }
  // volume: deferred — returns false for now
  return false;
}

// ── Timeout processor ─────────────────────────────────────────────────────────

async function processTimeouts(now, fetchFn = fetch) {
  const ids = await kv.lrange('automation:jobs:index', 0, -1);
  for (const id of ids) {
    try {
      const job = await kv.get(`automation:job:${id}`);
      if (!job || job.status !== 'pending_review') continue;
      const rule = await kv.get(`automation:rule:${job.ruleId}`);
      if (!rule) continue;
      const ageHours = (new Date(now) - new Date(job.createdAt)) / (1000 * 60 * 60);
      if (ageHours < rule.review.timeoutHours) continue;

      const onTimeout = rule.review.onTimeout ?? 'approve';
      if (onTimeout === 'approve' || onTimeout === 'reject') {
        await fetchFn(`${APP_URL}/api/automation/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: job.id, action: onTimeout, channel: 'timeout' }),
        });
      } else {
        // 'skip' — mark as timed out without actioning
        await kv.set(`automation:job:${id}`, { ...job, status: 'timed_out', updatedAt: now });
      }
    } catch (err) {
      console.error(`Timeout processing failed for job ${id}:`, err.message);
    }
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req, res, { fetchFn = fetch } = {}) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const now = new Date().toISOString();
  const results = { processed: 0, errors: [] };

  // 1. Process timeouts first (skip for manual single-rule runs)
  const forcedRuleId = req.method === 'POST' ? req.body?.ruleId : null;
  if (!forcedRuleId) await processTimeouts(now, fetchFn);

  // 2. Load rules — single forced rule or all due rules
  let dueRules;
  if (forcedRuleId) {
    const rule = await kv.get(`automation:rule:${forcedRuleId}`);
    if (!rule) return res.status(404).json({ error: 'Rule not found' });
    dueRules = [rule];
  } else {
    const ids = await kv.lrange('automation:rules:index', 0, -1);
    if (!ids.length) return res.status(200).json({ ...results, message: 'No rules configured' });
    const rules = (await Promise.all(ids.map(id => kv.get(`automation:rule:${id}`)))).filter(Boolean);
    dueRules = rules.filter(r => isRuleDue(r, now));
  }

  for (const rule of dueRules) {
    try {
      // 3. Fetch sources
      const sourceItems = await fetchSources(rule.sources, rule.lastRunAt, fetchFn);
      if (!sourceItems.length) continue;

      // 4. Generate content (up to maxArticlesPerRun)
      const toProcess = sourceItems.slice(0, rule.generation.maxArticlesPerRun);
      let ruleProcessedCount = 0;
      for (const item of toProcess) {
        const genRes = await fetchFn(`${APP_URL}/api/content`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: item.title,
            body: item.rawText ?? '',
            category: rule.category,
            wpCategorySlug: rule.wpCategorySlug ?? null,
            template: rule.generation.template,
            model: rule.generation.model ?? null,
            automationRuleId: rule.id,
          }),
        });

        if (!genRes.ok) {
          results.errors.push(`Content gen failed: ${item.title}`);
          continue;
        }
        const content = await genRes.json();

        if (rule.review.required) {
          // 5a. Create job and notify
          const job = buildJob({ ruleId: rule.id, contentId: content.id });
          await kv.set(`automation:job:${job.id}`, job);
          await kv.lpush('automation:jobs:index', job.id);

          const notifyErrors = await sendNotifications({ rule, job, content, fetchFn });
          if (notifyErrors.length) results.errors.push(...notifyErrors);

          // Mark job as notified
          await kv.set(`automation:job:${job.id}`, { ...job, notifiedAt: now });
        } else {
          // 5b. Auto-publish immediately
          const publishRes = await fetchFn(`${APP_URL}/api/publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: content.id }),
          });
          const finalStatus = publishRes.ok ? 'auto_published' : 'approved'; // fallback if publish fails

          const job = buildJob({ ruleId: rule.id, contentId: content.id, status: finalStatus });
          await kv.set(`automation:job:${job.id}`, { ...job, approvedBy: 'auto', approvedAt: now });
          await kv.lpush('automation:jobs:index', job.id);
        }
        ruleProcessedCount++;
        results.processed++;
      }

      // 6. Update rule.lastRunAt and stats — only if we actually processed items
      if (ruleProcessedCount > 0) {
        await kv.set(`automation:rule:${rule.id}`, {
          ...rule,
          lastRunAt: now,
          updatedAt: now,
          stats: {
            ...rule.stats,
            totalRuns: (rule.stats?.totalRuns ?? 0) + 1,
            articlesGenerated: (rule.stats?.articlesGenerated ?? 0) + ruleProcessedCount,
          },
        });
      }
    } catch (err) {
      results.errors.push(`Rule ${rule.id}: ${err.message}`);
    }
  }

  return res.status(200).json(results);
}

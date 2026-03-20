import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseRssItems, filterNewItems, fetchSources } from './fetch.js';

// ── parseRssItems ─────────────────────────────────────────────────────────────

describe('parseRssItems', () => {
  it('extracts title, url, and pubDate from RSS XML', () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Test Article</title>
      <link>https://example.com/article</link>
      <pubDate>Thu, 01 Jan 2026 00:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

    const items = parseRssItems(xml);
    assert.equal(items.length, 1);
    assert.equal(items[0].title, 'Test Article');
    assert.equal(items[0].url, 'https://example.com/article');
    assert.ok(items[0].pubDate instanceof Date);
    assert.equal(items[0].pubDate.getFullYear(), 2026);
    assert.equal(items[0].rawText, '');
  });

  it('handles CDATA-wrapped titles', () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <item>
      <title><![CDATA[CDATA Title & Special <chars>]]></title>
      <link>https://example.com/cdata</link>
      <pubDate>Fri, 02 Jan 2026 00:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

    const items = parseRssItems(xml);
    assert.equal(items.length, 1);
    assert.equal(items[0].title, 'CDATA Title & Special <chars>');
    assert.equal(items[0].url, 'https://example.com/cdata');
  });

  it('returns empty array for XML with no items', () => {
    const xml = `<?xml version="1.0"?><rss><channel></channel></rss>`;
    const items = parseRssItems(xml);
    assert.deepEqual(items, []);
  });

  it('handles multiple items', () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Article One</title>
      <link>https://example.com/one</link>
      <pubDate>Thu, 01 Jan 2026 00:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Article Two</title>
      <link>https://example.com/two</link>
      <pubDate>Fri, 02 Jan 2026 00:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

    const items = parseRssItems(xml);
    assert.equal(items.length, 2);
    assert.equal(items[0].title, 'Article One');
    assert.equal(items[1].title, 'Article Two');
  });
});

// ── filterNewItems ────────────────────────────────────────────────────────────

describe('filterNewItems', () => {
  const items = [
    { title: 'Old', url: 'https://example.com/old', pubDate: new Date('2025-01-01'), rawText: '' },
    { title: 'New', url: 'https://example.com/new', pubDate: new Date('2026-06-01'), rawText: '' },
    { title: 'Newer', url: 'https://example.com/newer', pubDate: new Date('2026-12-01'), rawText: '' },
  ];

  it('filters items older than lastRunAt', () => {
    const filtered = filterNewItems(items, '2026-01-01T00:00:00Z');
    assert.equal(filtered.length, 2);
    assert.equal(filtered[0].title, 'New');
    assert.equal(filtered[1].title, 'Newer');
  });

  it('returns all items when lastRunAt is null', () => {
    const filtered = filterNewItems(items, null);
    assert.equal(filtered.length, 3);
  });

  it('returns all items when lastRunAt is undefined', () => {
    const filtered = filterNewItems(items, undefined);
    assert.equal(filtered.length, 3);
  });

  it('returns empty array when all items are older than lastRunAt', () => {
    const filtered = filterNewItems(items, '2027-01-01T00:00:00Z');
    assert.equal(filtered.length, 0);
  });
});

// ── fetchSources ──────────────────────────────────────────────────────────────

describe('fetchSources', () => {
  it('with RSS source returns mapped items using mock fetch', async () => {
    const rssXml = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Mocked RSS Item</title>
      <link>https://example.com/mocked</link>
      <pubDate>Thu, 01 Jan 2026 00:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

    const mockFetch = async () => ({
      ok: true,
      text: async () => rssXml,
    });

    const sources = [{ type: 'rss', url: 'https://example.com/feed.rss' }];
    const results = await fetchSources(sources, null, mockFetch);

    assert.equal(results.length, 1);
    assert.equal(results[0].title, 'Mocked RSS Item');
    assert.equal(results[0].url, 'https://example.com/mocked');
    assert.equal(results[0].sourceType, 'rss');
  });

  it('skips failed sources and continues with others (non-fatal)', async () => {
    const rssXml = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Good Source Item</title>
      <link>https://good.com/item</link>
      <pubDate>Thu, 01 Jan 2026 00:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

    let callCount = 0;
    const mockFetch = async (url) => {
      callCount++;
      if (url.includes('bad')) {
        return { ok: false, status: 500 };
      }
      return {
        ok: true,
        text: async () => rssXml,
      };
    };

    const sources = [
      { type: 'rss', url: 'https://bad.com/feed.rss' },
      { type: 'rss', url: 'https://good.com/feed.rss' },
    ];

    const results = await fetchSources(sources, null, mockFetch);

    // Should only have results from the good source
    assert.equal(results.length, 1);
    assert.equal(results[0].title, 'Good Source Item');
  });

  it('warns and skips unsupported source types', async () => {
    const mockFetch = async () => ({ ok: true, text: async () => '' });
    const sources = [{ type: 'unknown', url: 'https://example.com' }];
    const results = await fetchSources(sources, null, mockFetch);
    assert.equal(results.length, 0);
  });
});

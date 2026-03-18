import { kv } from '@vercel/kv';

// Map app category IDs → WordPress category slugs
const CATEGORY_SLUG_MAP = {
  'industry-news':    'content-healthcare-news',
  'clinical-reviews': 'content-clinical-reviews',
  'op-eds':           'content-expert-opinions',
  'white-papers':     'content-white-papers',
  'infographics':     'content-infographic',
};

// Resolve a WP category slug to its numeric ID via the REST API.
// Returns the ID on success, or null if not found / on error.
async function resolveWpCategoryId(slug, siteUrl, authHeader) {
  try {
    const resp = await fetch(
      `${siteUrl}/wp-json/wp/v2/categories?slug=${encodeURIComponent(slug)}&per_page=1`,
      { headers: { Authorization: authHeader } }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    return Array.isArray(data) && data.length > 0 ? data[0].id : null;
  } catch {
    return null;
  }
}

export function buildWpPayload(item, categoryIds) {
  return {
    title:      item.title,
    content:    item.body,
    excerpt:    item.excerpt ?? '',
    status:     'publish',
    categories: Array.isArray(categoryIds) && categoryIds.length > 0 ? categoryIds : [],
  };
}

async function publishToWordPress(item) {
  const credentials = Buffer.from(
    `${process.env.WP_USERNAME}:${process.env.WP_APP_PASSWORD}`
  ).toString('base64');
  const authHeader = `Basic ${credentials}`;
  const siteUrl    = process.env.WP_SITE_URL;

  // Resolve category slug → numeric ID
  const slug       = CATEGORY_SLUG_MAP[item.category] ?? null;
  const categoryId = slug ? await resolveWpCategoryId(slug, siteUrl, authHeader) : null;
  const categoryIds = categoryId ? [categoryId] : [];

  if (slug && !categoryId) {
    console.warn(`[publish] WP category slug "${slug}" not found — posting without category`);
  }

  const response = await fetch(`${siteUrl}/wp-json/wp/v2/posts`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': authHeader,
    },
    body: JSON.stringify(buildWpPayload(item, categoryIds)),
  });

  if (!response.ok) {
    const err = await response.text();
    // Include which username was attempted to aid debugging
    throw new Error(`WordPress API ${response.status} (user: ${process.env.WP_USERNAME ?? 'not set'}, site: ${process.env.WP_SITE_URL ?? 'not set'}): ${err}`);
  }
  return response.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { contentId } = req.body;
  if (!contentId) return res.status(400).json({ error: 'contentId required' });

  const item = await kv.get(`content:${contentId}`);
  if (!item) return res.status(404).json({ error: 'Not found' });
  if (!['approved', 'scheduled'].includes(item.status)) {
    return res.status(400).json({ error: 'Content must be approved or scheduled to publish' });
  }

  let wpPost;
  try {
    wpPost = await publishToWordPress(item);
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }

  const updated = {
    ...item,
    status: 'published',
    publishedAt: new Date().toISOString(),
    wpPostId: wpPost.id,
    wpPostUrl: wpPost.link,
    updatedAt: new Date().toISOString(),
  };
  await kv.set(`content:${contentId}`, updated);
  return res.json({ wpPostId: wpPost.id, wpPostUrl: wpPost.link });
}

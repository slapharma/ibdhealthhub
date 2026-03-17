import { kv } from '@vercel/kv';

const CATEGORY_MAP = {
  'clinical-reviews':  0,  // update with real WP category IDs
  'industry-news':     1,
  'op-eds':            0,
  'white-papers':      0,
  'infographics':      0,
};

export function buildWpPayload(item, categoryMap = CATEGORY_MAP) {
  return {
    title:      item.title,
    content:    item.body,
    excerpt:    item.excerpt ?? '',
    status:     'publish',
    categories: categoryMap[item.category] ? [categoryMap[item.category]] : [],
  };
}

async function publishToWordPress(item) {
  const credentials = Buffer.from(
    `${process.env.WP_USERNAME}:${process.env.WP_APP_PASSWORD}`
  ).toString('base64');

  const response = await fetch(`${process.env.WP_SITE_URL}/wp-json/wp/v2/posts`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Basic ${credentials}`,
    },
    body: JSON.stringify(buildWpPayload(item)),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`WordPress API ${response.status}: ${err}`);
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

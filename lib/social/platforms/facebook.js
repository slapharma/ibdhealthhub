// lib/social/platforms/facebook.js

const GRAPH_BASE = 'https://graph.facebook.com/v19.0';

export async function postFacebook(platformData) {
  const token = process.env.FACEBOOK_ACCESS_TOKEN;
  const pageId = process.env.FACEBOOK_PAGE_ID;

  if (!token || !pageId) throw new Error('FACEBOOK_ACCESS_TOKEN or FACEBOOK_PAGE_ID not configured');

  const text = platformData.hashtags?.length
    ? `${platformData.caption}\n\n${platformData.hashtags.join(' ')}`
    : platformData.caption;

  let endpoint, body;

  if (platformData.image?.url) {
    // Post with photo
    endpoint = `${GRAPH_BASE}/${pageId}/photos`;
    body = {
      message: text,
      url: platformData.image.url,
      access_token: token,
    };
  } else {
    // Text-only post
    endpoint = `${GRAPH_BASE}/${pageId}/feed`;
    body = {
      message: text,
      access_token: token,
    };
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Facebook post failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  return { postId: data.id || data.post_id || null };
}

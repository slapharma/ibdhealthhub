// lib/social/platforms/linkedin.js

const API_BASE = 'https://api.linkedin.com/v2';

export async function postLinkedIn(platformData) {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  const authorUrn = `urn:li:person:${process.env.LINKEDIN_PERSON_ID}`;

  if (!token) throw new Error('LINKEDIN_ACCESS_TOKEN not configured');

  // Build the post text with hashtags appended
  const text = platformData.hashtags?.length
    ? `${platformData.caption}\n\n${platformData.hashtags.join(' ')}`
    : platformData.caption;

  // UGC Post payload
  const body = {
    author: authorUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text },
        shareMediaCategory: platformData.image?.url ? 'IMAGE' : 'NONE',
        ...(platformData.image?.url ? {
          media: [{
            status: 'READY',
            originalUrl: platformData.image.url,
          }],
        } : {}),
      },
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  };

  const res = await fetch(`${API_BASE}/ugcPosts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LinkedIn post failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  // LinkedIn returns the URN in the id field: urn:li:ugcPost:123456
  const postId = data.id || data['id'] || null;
  return { postId };
}

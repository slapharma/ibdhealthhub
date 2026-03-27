// lib/social/platforms/instagram.js

const GRAPH_BASE = 'https://graph.facebook.com/v19.0';

async function graphPost(endpoint, body, token) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, access_token: token }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Instagram Graph API error (${res.status}): ${err}`);
  }
  return res.json();
}

export async function postInstagram(platformData) {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;

  if (!token || !accountId) throw new Error('INSTAGRAM_ACCESS_TOKEN or INSTAGRAM_BUSINESS_ACCOUNT_ID not configured');

  const caption = platformData.hashtags?.length
    ? `${platformData.caption}\n\n${platformData.hashtags.join(' ')}`
    : platformData.caption;

  // Prefer video (Reel) if available and uploaded, otherwise fall back to image
  if (platformData.video?.url) {
    // Create Reel container
    const container = await graphPost(
      `${GRAPH_BASE}/${accountId}/media`,
      {
        media_type: 'REELS',
        video_url: platformData.video.url,
        caption,
        share_to_feed: true,
      },
      token
    );

    // Wait for container to be ready (poll up to 30s)
    const containerId = container.id;
    let containerReady = false;
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const status = await fetch(
        `${GRAPH_BASE}/${containerId}?fields=status_code&access_token=${token}`
      ).then(r => r.json());
      if (status.status_code === 'FINISHED') { containerReady = true; break; }
      if (status.status_code === 'ERROR') throw new Error('Instagram Reel container failed');
    }
    if (!containerReady) throw new Error('Instagram Reel container timed out (30s) — video may still be processing');

    // Publish
    const publish = await graphPost(`${GRAPH_BASE}/${accountId}/media_publish`, { creation_id: containerId }, token);
    return { postId: publish.id };
  }

  if (platformData.image?.url) {
    // Static image post
    const container = await graphPost(
      `${GRAPH_BASE}/${accountId}/media`,
      { image_url: platformData.image.url, caption },
      token
    );
    const publish = await graphPost(
      `${GRAPH_BASE}/${accountId}/media_publish`,
      { creation_id: container.id },
      token
    );
    return { postId: publish.id };
  }

  throw new Error('Instagram requires image or video URL');
}

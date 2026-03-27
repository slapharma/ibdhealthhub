// lib/social/platforms/tiktok.js

const API_BASE = 'https://open.tiktokapis.com/v2/post/publish/video/init/';

export async function postTikTok(platformData) {
  const token = process.env.TIKTOK_ACCESS_TOKEN;
  if (!token) throw new Error('TIKTOK_ACCESS_TOKEN not configured');

  const caption = platformData.hashtags?.length
    ? `${platformData.caption} ${platformData.hashtags.join(' ')}`
    : platformData.caption;

  if (!platformData.video?.url) throw new Error('TikTok requires a video URL');

  // TikTok Content Posting API — PULL_FROM_URL method
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      post_info: {
        title: caption.slice(0, 150), // TikTok title field
        privacy_level: 'PUBLIC_TO_EVERYONE',
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: platformData.video.url,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`TikTok post failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  return { postId: data.data?.publish_id || null };
}

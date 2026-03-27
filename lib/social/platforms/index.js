// lib/social/platforms/index.js
import { postInstagram } from './instagram.js';
import { postTikTok } from './tiktok.js';
import { postLinkedIn } from './linkedin.js';
import { postTwitter } from './twitter.js';
import { postFacebook } from './facebook.js';

const adapters = {
  instagram: postInstagram,
  tiktok:    postTikTok,
  linkedin:  postLinkedIn,
  twitter:   postTwitter,
  facebook:  postFacebook,
};

/**
 * Post content to a platform using server-side env var credentials.
 * @param {string} platform
 * @param {object} platformData - The platform slice from a ContentKit (caption, hashtags, image, video, reelScript, etc.)
 * @returns {Promise<{ postId: string }>} - All adapters must return this shape
 * @throws {Error} If platform has no registered adapter
 */
export async function dispatch(platform, platformData) {
  const adapter = adapters[platform];
  if (!adapter) throw new Error(`No adapter for platform "${platform}". Known: ${Object.keys(adapters).join(', ')}`);
  return adapter(platformData);
}

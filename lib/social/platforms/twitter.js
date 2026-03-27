// lib/social/platforms/twitter.js
import OAuth from 'oauth-1.0a';
import crypto from 'crypto';

const API_BASE = 'https://api.twitter.com/2/tweets';

function getOAuthHeaders(url, method) {
  const oauth = new OAuth({
    consumer: {
      key: process.env.TWITTER_API_KEY,
      secret: process.env.TWITTER_API_SECRET,
    },
    signature_method: 'HMAC-SHA1',
    hash_function: (base, key) => crypto.createHmac('sha1', key).update(base).digest('base64'),
  });

  const token = {
    key: process.env.TWITTER_ACCESS_TOKEN,
    secret: process.env.TWITTER_ACCESS_SECRET,
  };

  return oauth.toHeader(oauth.authorize({ url, method }, token));
}

async function postTweet(text, replyToId = null) {
  const body = { text };
  if (replyToId) body.reply = { in_reply_to_tweet_id: replyToId };

  const oauthHeaders = getOAuthHeaders(API_BASE, 'POST');

  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...oauthHeaders,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Twitter post failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.data?.id;
}

export async function postTwitter(platformData) {
  const thread = platformData.thread || [];
  if (!thread.length) throw new Error('Twitter thread is empty');

  if (!process.env.TWITTER_API_KEY) throw new Error('TWITTER_API_KEY not configured');

  let previousTweetId = null;
  let firstTweetId = null;

  for (const tweetText of thread) {
    const tweetId = await postTweet(tweetText, previousTweetId);
    if (!firstTweetId) firstTweetId = tweetId;
    previousTweetId = tweetId;
  }

  return { postId: firstTweetId }; // store first tweet ID as platformPostId
}

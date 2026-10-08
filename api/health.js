import { Redis } from '@upstash/redis';

const KEY = 'tt_state_v1';

function describeUrl(raw) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return {
      protocol: u.protocol,
      hostname: u.hostname,
      hasUsername: !!u.username,
      username: u.username || null,
      hasPassword: !!u.password,
    };
  } catch (e) {
    return { error: 'invalid URL', rawPrefix: String(raw).slice(0, 12) };
  }
}

function parseUpstashUrl(raw) {
  try {
    const u = new URL(raw);
    const proto = u.protocol;
    if (proto === 'http:' || proto === 'https:') {
      const url = u.origin;
      const token = u.password || u.username || '';
      return token ? { url, token } : { url };
    }
    if (proto === 'redis:' || proto === 'rediss:') {
      const url = 'https://' + u.hostname;
      const token = u.password || '';
      return token ? { url, token } : { url };
    }
  } catch (e) {}
  return {};
}

function getRedis() {
  const restUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const restToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (restUrl && restToken) return new Redis({ url: restUrl, token: restToken });

  const raw = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL;
  if (raw) {
    const { url, token } = parseUpstashUrl(raw);
    if (url && token) return new Redis({ url, token });
  }
  return null;
}

export default {
  async fetch() {
    const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL || null;
    const result = {
      env: {
        UPSTASH_REDIS_REST_URL: !!process.env.UPSTASH_REDIS_REST_URL,
        UPSTASH_REDIS_REST_TOKEN: !!process.env.UPSTASH_REDIS_REST_TOKEN,
        UPSTASH_REDIS_URL: !!process.env.UPSTASH_REDIS_URL,
        REDIS_URL: !!process.env.REDIS_URL,
        KV_REST_API_URL: !!process.env.KV_REST_API_URL,
        KV_REST_API_TOKEN: !!process.env.KV_REST_API_TOKEN,
      },
      redisUrl: describeUrl(redisUrl),
      redisConfigured: false,
      writeReadTest: null,
      storedState: null,
    };

    const redis = getRedis();
    if (!redis) {
      return Response.json(result);
    }
    result.redisConfigured = true;

    try {
      await redis.set('tt_health_probe', 'ok');
      const val = await redis.get('tt_health_probe');
      await redis.del('tt_health_probe');
      result.writeReadTest = val === 'ok' ? 'ok' : 'unexpected';
    } catch (e) {
      result.writeReadTest = 'error: ' + (e && e.message ? e.message : String(e));
    }

    try {
      const raw = await redis.get(KEY);
      if (raw) {
        const data = JSON.parse(raw);
        result.storedState = {
          hasData: true,
          workspaces: Array.isArray(data.workspaces) ? data.workspaces.length : 0,
        };
      } else {
        result.storedState = { hasData: false };
      }
    } catch (e) {
      result.storedState = { error: e && e.message ? e.message : String(e) };
    }

    return Response.json(result);
  },
};

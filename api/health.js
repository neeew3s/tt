import { Redis as UpstashRedis } from '@upstash/redis';
import IORedis from 'ioredis';

const KEY = 'tt_state_v1';

function describeUrl(raw) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return {
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port || null,
      hasUsername: !!u.username,
      username: u.username || null,
      hasPassword: !!u.password,
    };
  } catch (e) {
    return { error: 'invalid URL', rawPrefix: String(raw).slice(0, 12) };
  }
}

function getClient() {
  const restUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const restToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (restUrl && restToken) {
    return { client: new UpstashRedis({ url: restUrl, token: restToken }), kind: 'rest' };
  }

  const tcpUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL;
  if (tcpUrl) {
    return {
      client: new IORedis(tcpUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 8000,
        retryStrategy: () => null,
      }),
      kind: 'tcp',
    };
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
      },
      redisUrl: describeUrl(redisUrl),
      redisConfigured: false,
      writeReadTest: null,
      storedState: null,
    };

    const c = getClient();
    if (!c) {
      return Response.json(result);
    }
    result.redisConfigured = true;
    result.kind = c.kind;

    try {
      await c.client.set('tt_health_probe', 'ok');
      const val = await c.client.get('tt_health_probe');
      await c.client.del('tt_health_probe');
      result.writeReadTest = val === 'ok' ? 'ok' : 'unexpected';
    } catch (e) {
      result.writeReadTest = 'error: ' + (e && e.message ? e.message : String(e));
    }

    try {
      const raw = await c.client.get(KEY);
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

    if (c.kind === 'tcp') {
      try { c.client.disconnect(); } catch (e) { /* ignore */ }
    }

    return Response.json(result);
  },
};

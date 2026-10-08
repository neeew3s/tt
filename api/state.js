import { Redis } from '@upstash/redis';

const KEY = 'tt_state_v1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Разбирает одиночный URL в { url, token } для Upstash REST API.
// Поддерживает rediss://default:PASSWORD@HOST:6379 и https://[TOKEN@]HOST.
function parseUpstashUrl(raw) {
  try {
    const u = new URL(raw);
    const proto = u.protocol;
    if (proto === 'http:' || proto === 'https:') {
      const url = u.origin; // без userinfo и пути
      const token = u.password || u.username || '';
      return token ? { url, token } : { url };
    }
    if (proto === 'redis:' || proto === 'rediss:') {
      const url = 'https://' + u.hostname;
      const token = u.password || '';
      return token ? { url, token } : { url };
    }
  } catch (e) {
    // невалидный URL — игнорируем
  }
  return {};
}

function getRedis() {
  // 1) Стандартные имена Upstash REST (Vercel Marketplace)
  const restUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const restToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (restUrl && restToken) return new Redis({ url: restUrl, token: restToken });

  // 2) Одиночный URL (REDIS_URL / UPSTASH_REDIS_URL): rediss:// или https://
  const raw = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL;
  if (raw) {
    const { url, token } = parseUpstashUrl(raw);
    if (url && token) return new Redis({ url, token });
  }

  return null;
}

export default {
  async fetch(request) {
    // CORS preflight
    if (request.method.toUpperCase() === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const method = request.method.toUpperCase();

    if (method === 'GET') {
      const redis = getRedis();
      if (!redis) {
        return Response.json({ error: 'Хранилище не настроено' }, { status: 503, headers: corsHeaders });
      }
      try {
        const raw = await redis.get(KEY);
        const data = raw ? JSON.parse(raw) : null;
        return Response.json(data, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ error: 'Хранилище недоступно' }, { status: 503, headers: corsHeaders });
      }
    }

    if (method === 'PUT') {
      const redis = getRedis();
      if (!redis) {
        return Response.json({ error: 'Хранилище не настроено' }, { status: 503, headers: corsHeaders });
      }
      try {
        const body = await request.json();
        await redis.set(KEY, JSON.stringify(body));
        return Response.json({ ok: true }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ error: 'Не удалось сохранить' }, { status: 500, headers: corsHeaders });
      }
    }

    return Response.json({ error: 'Method Not Allowed' }, { status: 405, headers: corsHeaders });
  },
};

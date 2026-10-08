import { Redis } from '@upstash/redis';

const KEY = 'tt_state_v1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
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

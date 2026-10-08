import { Redis as UpstashRedis } from '@upstash/redis';
import IORedis from 'ioredis';

const KEY = 'tt_state_v1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Возвращает единый клиент: либо TCP (ioredis, для redis://rediss://),
// либо REST (Upstash, для UPSTASH_REDIS_REST_URL + TOKEN).
function getClient() {
  // 1) Upstash REST (HTTP)
  const restUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const restToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (restUrl && restToken) {
    return { client: new UpstashRedis({ url: restUrl, token: restToken }), kind: 'rest' };
  }

  // 2) Обычный Redis по TCP (redis:// или rediss://) — Redis Cloud и т.п.
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

function closeClient(c) {
  if (c && c.kind === 'tcp') {
    try { c.client.disconnect(); } catch (e) { /* ignore */ }
  }
}

export default {
  async fetch(request) {
    // CORS preflight
    if (request.method.toUpperCase() === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const method = request.method.toUpperCase();

    if (method === 'GET') {
      const c = getClient();
      if (!c) {
        return Response.json({ error: 'Хранилище не настроено' }, { status: 503, headers: corsHeaders });
      }
      try {
        const raw = await c.client.get(KEY);
        const data = raw ? JSON.parse(raw) : null;
        return Response.json(data, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ error: 'Хранилище недоступно' }, { status: 503, headers: corsHeaders });
      } finally {
        closeClient(c);
      }
    }

    if (method === 'PUT') {
      const c = getClient();
      if (!c) {
        return Response.json({ error: 'Хранилище не настроено' }, { status: 503, headers: corsHeaders });
      }
      try {
        const body = await request.json();
        await c.client.set(KEY, JSON.stringify(body));
        return Response.json({ ok: true }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ error: 'Не удалось сохранить' }, { status: 500, headers: corsHeaders });
      } finally {
        closeClient(c);
      }
    }

    if (method === 'DELETE') {
      const c = getClient();
      if (!c) {
        return Response.json({ error: 'Хранилище не настроено' }, { status: 503, headers: corsHeaders });
      }
      try {
        await c.client.del(KEY);
        return Response.json({ ok: true }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ error: 'Не удалось удалить' }, { status: 500, headers: corsHeaders });
      } finally {
        closeClient(c);
      }
    }

    return Response.json({ error: 'Method Not Allowed' }, { status: 405, headers: corsHeaders });
  },
};

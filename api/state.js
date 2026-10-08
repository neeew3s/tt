import { kv } from '@vercel/kv';

const KEY = 'tt_state_v1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request) {
    // CORS preflight
    if (request.method.toUpperCase() === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const method = request.method.toUpperCase();

    if (method === 'GET') {
      try {
        const data = await kv.get(KEY);
        return Response.json(data ?? null, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ error: 'Хранилище недоступно' }, { status: 503, headers: corsHeaders });
      }
    }

    if (method === 'PUT') {
      try {
        const body = await request.json();
        await kv.set(KEY, body);
        return Response.json({ ok: true }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ error: 'Не удалось сохранить' }, { status: 500, headers: corsHeaders });
      }
    }

    return Response.json({ error: 'Method Not Allowed' }, { status: 405, headers: corsHeaders });
  },
};

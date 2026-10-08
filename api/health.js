import { Redis } from '@upstash/redis';

const KEY = 'tt_state_v1';

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export default {
  async fetch() {
    const result = {
      env: {
        UPSTASH_REDIS_REST_URL: !!process.env.UPSTASH_REDIS_REST_URL,
        UPSTASH_REDIS_REST_TOKEN: !!process.env.UPSTASH_REDIS_REST_TOKEN,
        UPSTASH_REDIS_URL: !!process.env.UPSTASH_REDIS_URL,
        KV_REST_API_URL: !!process.env.KV_REST_API_URL,
        KV_REST_API_TOKEN: !!process.env.KV_REST_API_TOKEN,
      },
      redisConfigured: false,
      writeReadTest: null,
      storedState: null,
    };

    const redis = getRedis();
    if (!redis) {
      return Response.json(result);
    }
    result.redisConfigured = true;

    // Живой тест: запись → чтение → удаление пробного ключа
    try {
      await redis.set('tt_health_probe', 'ok');
      const val = await redis.get('tt_health_probe');
      await redis.del('tt_health_probe');
      result.writeReadTest = val === 'ok' ? 'ok' : 'unexpected';
    } catch (e) {
      result.writeReadTest = 'error: ' + (e && e.message ? e.message : String(e));
    }

    // Есть ли уже сохранённое состояние
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

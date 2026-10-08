import { Redis } from '@upstash/redis';

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

export default {
  async fetch() {
    const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL || null;
    const info = {
      env: {
        UPSTASH_REDIS_REST_URL: !!process.env.UPSTASH_REDIS_REST_URL,
        UPSTASH_REDIS_REST_TOKEN: !!process.env.UPSTASH_REDIS_REST_TOKEN,
        UPSTASH_REDIS_URL: !!process.env.UPSTASH_REDIS_URL,
        REDIS_URL: !!process.env.REDIS_URL,
      },
      redisUrl: describeUrl(redisUrl),
    };

    // Быстрый сетевой тест через raw fetch с жёстким таймаутом 8с,
    // чтобы не зависнуть. Показывает реальный ответ Upstash REST API.
    const probe = { attempted: false, status: null, body: null, error: null };
    if (redisUrl) {
      const desc = describeUrl(redisUrl);
      if (desc && (desc.protocol === 'redis:' || desc.protocol === 'rediss:')) {
        const host = desc.hostname;
        const token = (() => { try { const u = new URL(redisUrl); return u.password || ''; } catch (e) { return ''; } })();
        probe.attempted = true;
        probe.restUrl = 'https://' + host;
        probe.tokenLen = token.length;
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 8000);
          const res = await fetch('https://' + host + '/ping', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token },
            signal: ctrl.signal,
          });
          clearTimeout(t);
          probe.status = res.status;
          const text = await res.text();
          probe.body = text.slice(0, 200);
        } catch (e) {
          probe.error = (e && e.name ? e.name + ': ' : '') + (e && e.message ? e.message : String(e));
        }
      }
    }
    info.probe = probe;

    return Response.json(info);
  },
};

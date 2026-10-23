// Tiny Upstash Redis REST client (no dependencies). Works with the Vercel "Upstash Redis" integration.
const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOK = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const enabled = () => !!(URL_ && TOK);

async function cmd(args) {
  const r = await fetch(URL_, {
    method: 'POST', headers: { authorization: 'Bearer ' + TOK, 'content-type': 'application/json' },
    body: JSON.stringify(args), signal: AbortSignal.timeout(4000)
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
async function get(k) { if (!enabled()) return null; try { const v = await cmd(['GET', 'mm:' + k]); return v ? JSON.parse(v) : null; } catch { return null; } }
async function set(k, v, ttl) {
  if (!enabled()) throw new Error('storage not connected');
  await cmd(ttl ? ['SET', 'mm:' + k, JSON.stringify(v), 'EX', ttl] : ['SET', 'mm:' + k, JSON.stringify(v)]);
}
async function del(k) { if (!enabled()) return; await cmd(['DEL', 'mm:' + k]); }

module.exports = { enabled, get, set, del };

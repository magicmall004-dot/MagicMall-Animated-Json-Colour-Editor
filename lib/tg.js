const crypto = require('crypto');
const TOKEN = process.env.BOT_TOKEN;
const CHANNEL = (process.env.CHANNEL || '@magicmall_emoji').replace(/^@/, '');
const CHANNEL_URL = 'https://t.me/' + CHANNEL;

const api = (method, body) =>
  fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  }).then(r => r.json());

// Validate Telegram Mini App initData, returns user object or null
function verifyInitData(initData, maxAgeSec = 86400) {
  if (!initData || !TOKEN) return null;
  const p = new URLSearchParams(initData);
  const hash = p.get('hash'); if (!hash) return null;
  p.delete('hash');
  const str = [...p.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  const calc = Buffer.from(crypto.createHmac('sha256', secret).update(str).digest('hex'));
  const given = Buffer.from(hash);
  if (calc.length !== given.length || !crypto.timingSafeEqual(calc, given)) return null;
  if (Date.now() / 1000 - Number(p.get('auth_date')) > maxAgeSec) return null;
  try { return JSON.parse(p.get('user')); } catch { return null; }
}

async function readBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  const chunks = []; for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

module.exports = { api, verifyInitData, readBody, TOKEN, CHANNEL, CHANNEL_URL };

const { verifyInitData, readBody, TOKEN, CHANNEL, CHANNEL_URL } = require('../lib/tg');

const MAX = 4 * 1024 * 1024; // Vercel body limit is ~4.5 MB

async function upload(method, field, chatId, buf, filename, extra = {}) {
  const f = new FormData();
  f.append('chat_id', String(chatId));
  f.append(field, new Blob([buf]), filename);
  for (const [k, v] of Object.entries(extra)) f.append(k, v);
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, { method: 'POST', body: f });
  return r.json();
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const user = verifyInitData(req.headers['x-init-data']);
  if (!user) return res.status(401).send('auth failed');

  const buf = await readBody(req);
  if (!buf.length) return res.status(400).send('empty');
  if (buf.length > MAX) return res.status(413).send('too big');

  let filename = 'animation';
  try { filename = decodeURIComponent(req.headers['x-filename'] || 'animation'); } catch {}
  filename = filename.replace(/[^\w.\-() ]+/g, '_').slice(0, 80);

  const caption = `✅ Edited with Magic Mall Colour Editor\n📢 @${CHANNEL}`;
  const markup = JSON.stringify({ inline_keyboard: [[{ text: '📢 Join @' + CHANNEL, url: CHANNEL_URL }]] });

  // .tgs: also send as a real sticker preview
  if (/\.tgs$/i.test(filename)) await upload('sendSticker', 'sticker', user.id, buf, filename).catch(() => {});

  const out = await upload('sendDocument', 'document', user.id, buf, filename, { caption, reply_markup: markup });
  if (!out.ok) return res.status(502).send(out.description || 'telegram error');
  res.status(200).json({ ok: true });
};

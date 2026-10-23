const { verifyInitData, isMember, readBody, TOKEN, CHANNEL } = require('../lib/tg');

const MAX = 4 * 1024 * 1024; // Vercel body limit is ~4.5 MB

// Every Telegram call has a hard timeout so the function can never hang
async function upload(method, field, chatId, buf, filename, extra = {}) {
  const f = new FormData();
  f.append('chat_id', String(chatId));
  f.append(field, new Blob([buf], { type: 'application/octet-stream' }), filename);
  for (const [k, v] of Object.entries(extra)) f.append(k, v);
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST', body: f, signal: AbortSignal.timeout(9000)
  });
  return r.json();
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).end();
    const user = verifyInitData(req.headers['x-init-data']);
    if (!user) return res.status(401).send('auth failed');
    if (!(await isMember(user.id)).member) return res.status(403).send('Join @' + CHANNEL + ' first');

    const buf = await readBody(req);
    if (!buf.length) return res.status(400).send('empty');
    if (buf.length > MAX) return res.status(413).send('too big');

    let filename = 'animation';
    try { filename = decodeURIComponent(req.headers['x-filename'] || 'animation'); } catch {}
    filename = filename.replace(/[^\w.\-() ]+/g, '_').slice(0, 80);

    const caption = `✅ Edited with Magic Mall Colour Editor\n📢 @${CHANNEL}`;
    const jobs = [upload('sendDocument', 'document', user.id, buf, filename,
      { caption, disable_content_type_detection: 'true' })];
    // .tgs: also send a sticker preview (in parallel; failure is ignored)
    if (/\.tgs$/i.test(filename)) jobs.push(upload('sendSticker', 'sticker', user.id, buf, filename).catch(() => null));

    const [out] = await Promise.all(jobs);
    if (!out.ok) return res.status(502).send(out.description || 'telegram error');
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('send error', e);
    res.status(504).send('Telegram did not answer in time, try again');
  }
};

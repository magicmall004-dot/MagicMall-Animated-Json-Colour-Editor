const zlib = require('zlib');
const { verifyInitData, isMember, readBody, TOKEN, CHANNEL } = require('../lib/tg');

const MAX_UPLOAD = 4 * 1024 * 1024;   // Vercel request limit (compressed size)
const MAX_FILE = 20 * 1024 * 1024;    // after un-gzip

const CANT_RENDER = { inline_keyboard: [[{ text: "⚠️ Can't render? Send to admin", callback_data: 'cr' }]] };

async function upload(method, field, chatId, buf, filename, extra = {}, ms = 9000) {
  const f = new FormData();
  f.append('chat_id', String(chatId));
  f.append(field, new Blob([buf], { type: 'application/octet-stream' }), filename);
  for (const [k, v] of Object.entries(extra)) f.append(k, v);
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST', body: f, signal: AbortSignal.timeout(ms)
  });
  return r.json();
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).end();
    const user = verifyInitData(req.headers['x-init-data']);
    if (!user) return res.status(401).send('auth failed');
    if (!(await isMember(user.id)).member) return res.status(403).send('Join @' + CHANNEL + ' first');

    let buf = await readBody(req);
    if (!buf.length) return res.status(400).send('empty');
    if (buf.length > MAX_UPLOAD) return res.status(413).send('too big');
    if (req.headers['x-gzip'] === '1') {
      try { buf = zlib.gunzipSync(buf, { maxOutputLength: MAX_FILE }); }
      catch { return res.status(413).send('file too big (max 20 MB)'); }
    }

    let filename = 'animation';
    try { filename = decodeURIComponent(req.headers['x-filename'] || 'animation'); } catch {}
    filename = filename.replace(/[^\w.\-() ]+/g, '_').slice(0, 80);

    // .tgs -> ONE message: a real sticker (proves it renders) with the "Can't render" button
    if (/\.tgs$/i.test(filename)) {
      const st = await upload('sendSticker', 'sticker', user.id, buf, filename, { reply_markup: JSON.stringify(CANT_RENDER) }, 8000);
      if (st.ok) return res.status(200).json({ ok: true });
      // Telegram refused it as a sticker -> fall back to a file, same button
      const doc = await upload('sendDocument', 'document', user.id, buf, filename, {
        caption: '⚠️ Telegram could not make this a sticker (' + (st.description || 'invalid') + ')',
        reply_markup: JSON.stringify(CANT_RENDER), disable_content_type_detection: 'true'
      }, 15000);
      return doc.ok ? res.status(200).json({ ok: true }) : res.status(502).send(doc.description || 'telegram error');
    }

    const out = await upload('sendDocument', 'document', user.id, buf, filename, {
      caption: `✅ Edited with Magic Mall Colour Editor\n📢 @${CHANNEL}`, disable_content_type_detection: 'true'
    }, 20000);
    if (!out.ok) return res.status(502).send(out.description || 'telegram error');
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('send error', e);
    res.status(504).send('Telegram did not answer in time, try again');
  }
};

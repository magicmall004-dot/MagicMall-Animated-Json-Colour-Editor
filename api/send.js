const zlib = require('zlib');
const { api, verifyInitData, isMember, readBody, TOKEN } = require('../lib/tg');
const C = require('../lib/cfg');
const { makeZip } = require('../lib/zip');

const MAX_UPLOAD = 4 * 1024 * 1024;   // Vercel request limit (compressed size)
const MAX_FILE = 20 * 1024 * 1024;    // after un-gzip

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
    if (!(await isMember(user.id)).member) return res.status(403).send('Join the channel first');

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

    const cfg = await C.getCfg();
    const CANT_RENDER = { inline_keyboard: [[C.btn(cfg, 'btn_cr', { callback_data: 'cr' })]] };
    const cap = C.capOf(cfg, 'export_caption');
    const capFields = { caption: cap.caption, ...(cap.caption_entities ? { caption_entities: JSON.stringify(cap.caption_entities) } : {}) };

    // .tgs -> ONE message: a real sticker (proves it renders) with the "Can't render" button
    if (/\.tgs$/i.test(filename)) {
      const st = await upload('sendSticker', 'sticker', user.id, buf, filename, { reply_markup: JSON.stringify(CANT_RENDER) }, 8000);
      // Telegram silently turns a sticker it cannot validate into a plain file ("Unknown Track") -> detect it
      if (st.ok && st.result && st.result.sticker) return res.status(200).json({ ok: true, sticker: true });
      if (st.ok && st.result) await api('deleteMessage', { chat_id: user.id, message_id: st.result.message_id }).catch(() => {});

      const nb = C.capOf(cfg, 'not_sticker');
      const fb = {
        caption: nb.caption + (st.description ? '\n\n(' + st.description + ')' : ''),
        ...(nb.caption_entities ? { caption_entities: JSON.stringify(nb.caption_entities) } : {}),
        reply_markup: JSON.stringify(CANT_RENDER), disable_content_type_detection: 'true'
      };

      // 1) keep it a real ".tgs" file, with content-type detection off so Telegram shows the name
      const d1 = await upload('sendDocument', 'document', user.id, buf, filename, fb, 15000);
      const mime = (d1.ok && d1.result && d1.result.document && d1.result.document.mime_type) || '';
      if (d1.ok && !/tgsticker/i.test(mime)) return res.status(200).json({ ok: true, sticker: false });
      if (d1.ok) await api('deleteMessage', { chat_id: user.id, message_id: d1.result.message_id }).catch(() => {});

      // 2) Telegram still labels it as a sticker file -> send the readable Lottie .json instead
      let out = buf, name = filename;
      try { out = zlib.gunzipSync(buf, { maxOutputLength: MAX_FILE }); name = filename.replace(/\.tgs$/i, '') + '.json'; } catch {}
      const doc = await upload('sendDocument', 'document', user.id, out, name, fb, 15000);
      return doc.ok ? res.status(200).json({ ok: true, sticker: false }) : res.status(502).send(doc.description || 'telegram error');
    }

    // Transparent GIF/WebM: Telegram re-encodes them and loses the alpha -> send inside a .zip
    let fields = { ...capFields, disable_content_type_detection: 'true' };
    if (req.headers['x-zip'] === '1') {
      buf = makeZip(filename, buf);
      filename = filename.replace(/\.[^.]+$/, '') + '.zip';
      fields.caption += '\n\n📦 Unzip it to keep the transparent background.';
    }
    const out = await upload('sendDocument', 'document', user.id, buf, filename, fields, 20000);
    if (!out.ok) return res.status(502).send(out.description || 'telegram error');
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('send error', e);
    res.status(504).send('Telegram did not answer in time, try again');
  }
};

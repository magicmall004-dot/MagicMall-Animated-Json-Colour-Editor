const { api, OWNER_ID } = require('../lib/tg');
const C = require('../lib/cfg');
const store = require('../lib/store');
const panel = require('../lib/panel');

const appUrl = () => (process.env.APP_URL || '').replace(/\/$/, '');
const isOwner = (u) => u && String(u.id) === String(OWNER_ID);

// Button taps (Can't render + owner panel)
async function handleCallback(cq) {
  const ans = (text, alert) => api('answerCallbackQuery', { callback_query_id: cq.id, ...(text ? { text } : {}), ...(alert ? { show_alert: true } : {}) });
  const d = cq.data || '';
  if (d === 'noop') return ans();

  if (d === 'pr' || d.startsWith('p:') || d.startsWith('pb:')) {
    if (!isOwner(cq.from) || !cq.message) return ans('Owner only', true);
    await ans();
    return panel.callback(cq);
  }

  // Owner tapped "Send fixed file" under a request -> next message he sends goes to that user
  if (d.startsWith('fx:')) {
    if (!isOwner(cq.from) || !cq.message) return ans('Owner only', true);
    const uid = d.slice(3).replace(/\D/g, '');
    await ans('Ready');
    if (store.enabled()) { try { await store.set('fix', { uid }, 86400); } catch (e) { console.error('fix state', e.message); } }
    return api('sendMessage', {
      chat_id: cq.message.chat.id,
      text: `📤 Now send or FORWARD the fixed sticker / file / any message here.\nI will deliver it to the user.\n\nuid:${uid}\n/cancel = stop`
    });
  }

  if (d !== 'cr' || !cq.message) return ans();
  await ans('Sending to admin…');            // answer FIRST so the button never looks dead
  const m = cq.message, u = cq.from, chat = m.chat.id;
  const cfg = await C.getCfg();

  const copy = await api('copyMessage', { chat_id: OWNER_ID, from_chat_id: chat, message_id: m.message_id });
  if (!copy.ok) {
    console.error('copyMessage to owner failed', copy.description);
    return api('sendMessage', { chat_id: chat, text: '❌ Could not reach the admin right now. Please try again later.' });
  }
  const who = [u.first_name, u.last_name].filter(Boolean).join(' ') + (u.username ? ' @' + u.username : '');
  await api('sendMessage', {
    chat_id: OWNER_ID, reply_to_message_id: copy.result.message_id,
    text: `🆘 Can't render\n👤 ${who}\nuid:${u.id}\n\nTap the button, then forward the fixed sticker here.`,
    reply_markup: { inline_keyboard: [[{ text: '📤 Send fixed file', callback_data: 'fx:' + u.id, style: 'primary' }]] }
  });
  await api('editMessageReplyMarkup', { chat_id: chat, message_id: m.message_id, reply_markup: { inline_keyboard: [] } });
  return api('sendMessage', { chat_id: chat, ...C.msgOf(cfg, 'sent_admin') });
}

// Owner replied to a "Can't render" notice with a fixed file -> deliver to that user
async function handleOwnerReply(msg) {
  const m = ((msg.reply_to_message && msg.reply_to_message.text) || '').match(/uid:(\d+)/);
  if (!m || !(msg.sticker || msg.document)) return false;
  const cfg = await C.getCfg();
  const r = await api('copyMessage', {
    chat_id: m[1], from_chat_id: msg.chat.id, message_id: msg.message_id,
    ...(msg.document ? C.capOf(cfg, 'fixed') : {})
  });
  if (r.ok && msg.sticker) await api('sendMessage', { chat_id: m[1], ...C.msgOf(cfg, 'fixed') });
  await api('sendMessage', { chat_id: msg.chat.id, reply_to_message_id: msg.message_id, text: r.ok ? '✅ Delivered to user' : '❌ Failed: ' + r.description });
  return true;
}

const isPic = (ch) => /\p{Extended_Pictographic}/u.test(ch);
const strip = (x) => (x || '').replace(/\uFE0F/g, '');

// Emoji message -> find its animated sticker -> open the editor
async function handleEmoji(msg, cfg) {
  const chat = msg.chat.id;
  let found = [];
  const ents = (msg.entities || []).filter((e) => e.type === 'custom_emoji');
  if (ents.length) {
    const ids = [...new Set(ents.map((e) => e.custom_emoji_id))].slice(0, 8);
    const r = await api('getCustomEmojiStickers', { custom_emoji_ids: ids });
    if (r.ok) found = r.result;
    if (!found.length || !found.some((s) => s.is_animated)) return api('sendMessage', { chat_id: chat, ...C.msgOf(cfg, 'not_animated') });
  } else if (msg.text && msg.text.length <= 16 && isPic(msg.text)) {
    const want = [...new Set([...strip(msg.text)].filter(isPic))].slice(0, 6);
    const set = await api('getStickerSet', { name: 'AnimatedEmojies' });
    if (set.ok) for (const w of want) { const st = set.result.stickers.find((x) => strip(x.emoji) === w); if (st) found.push(st); }
    if (!found.length) return api('sendMessage', { chat_id: chat, ...C.msgOf(cfg, 'emoji_none') });
  } else return false;

  const anim = found.filter((s) => s.is_animated);
  const rows = []; let row = [];
  for (const st of anim) {
    const url = `${appUrl()}/?f=${encodeURIComponent(st.file_id)}&n=${encodeURIComponent('emoji-' + st.file_unique_id + '.tgs')}`;
    const b = C.btn(cfg, 'btn_edit', { web_app: { url } });
    if (anim.length > 1) b.text += ' ' + (st.emoji || '');
    row.push(b); if (row.length === 2) { rows.push(row); row = []; }
  }
  if (row.length) rows.push(row);
  return api('sendMessage', { chat_id: chat, reply_to_message_id: msg.message_id, ...C.msgOf(cfg, 'ready'), reply_markup: { inline_keyboard: rows } });
}

// Owner pressed "Send fixed file" earlier; this message is the fix -> copy it to the user
async function deliverFix(msg, uid) {
  const cfg = await C.getCfg();
  const hasCaption = msg.document || msg.photo || msg.video || msg.animation || msg.audio;
  const r = await api('copyMessage', {
    chat_id: uid, from_chat_id: msg.chat.id, message_id: msg.message_id, ...(hasCaption ? C.capOf(cfg, 'fixed') : {})
  });
  if (r.ok) {
    if (msg.sticker) await api('sendMessage', { chat_id: uid, ...C.msgOf(cfg, 'fixed') });
    await store.del('fix');
  }
  return api('sendMessage', {
    chat_id: msg.chat.id, reply_to_message_id: msg.message_id,
    text: r.ok ? '✅ Delivered to the user.' : '❌ Failed: ' + r.description + '\n(The user must have started the bot.)'
  });
}

async function handle(msg) {
  const chat = msg.chat.id;

  if (isOwner(msg.from) && msg.chat.type === 'private') {
    const t = (msg.text || '').trim();
    const fix = await store.get('fix');
    if (fix && fix.uid) {
      if (t === '/cancel') { await store.del('fix'); return api('sendMessage', { chat_id: chat, text: '✖️ Cancelled.' }); }
      if (!t.startsWith('/')) return deliverFix(msg, fix.uid);
    }
    if (msg.reply_to_message && await handleOwnerReply(msg)) return;
    if (t === '/panel') return panel.showMenu(chat);
    if (await panel.input(msg)) return;
  }

  const cfg = await C.getCfg();
  if (msg.text && !msg.text.startsWith('/')) { const h = await handleEmoji(msg, cfg); if (h) return h; }
  let fileId = null, name = null;
  if (msg.sticker) {
    if (!msg.sticker.is_animated) return api('sendMessage', { chat_id: chat, ...C.msgOf(cfg, 'not_animated') });
    fileId = msg.sticker.file_id; name = (msg.sticker.set_name || 'sticker') + '.tgs';
  } else if (msg.document) {
    const n = (msg.document.file_name || '').toLowerCase();
    if (n.endsWith('.tgs') || n.endsWith('.json') || n.endsWith('.svg')) { fileId = msg.document.file_id; name = msg.document.file_name; }
  }

  if (!fileId) return api('sendMessage', { chat_id: chat, ...C.msgOf(cfg, 'welcome') });

  const url = `${appUrl()}/?f=${encodeURIComponent(fileId)}&n=${encodeURIComponent(name)}`;
  return api('sendMessage', {
    chat_id: chat, reply_to_message_id: msg.message_id, ...C.msgOf(cfg, 'ready'),
    reply_markup: { inline_keyboard: [[C.btn(cfg, 'btn_edit', { web_app: { url } }), C.btn(cfg, 'btn_swap', { web_app: { url: url + '&t=swap' } })]] }
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(200).send('ok');
  if (req.headers['x-telegram-bot-api-secret-token'] !== process.env.WEBHOOK_SECRET) return res.status(401).end();
  try {
    const u = req.body || {};
    if (u.callback_query) await handleCallback(u.callback_query);
    else if (u.message) await handle(u.message);
  } catch (e) { console.error('webhook error', e); }
  res.status(200).json({ ok: true });
};

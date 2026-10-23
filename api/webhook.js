const { api, OWNER_ID } = require('../lib/tg');
const C = require('../lib/cfg');
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
    text: `🆘 Can't render\n👤 ${who}\nuid:${u.id}\n\n↩️ Reply to THIS message with the fixed .tgs / .json and the bot will deliver it to the user.`
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

async function handle(msg) {
  const chat = msg.chat.id;

  if (isOwner(msg.from) && msg.chat.type === 'private') {
    if (msg.reply_to_message && await handleOwnerReply(msg)) return;
    const t = (msg.text || '').trim();
    if (t === '/panel') return panel.showMenu(chat);
    if (await panel.input(msg)) return;
  }

  const cfg = await C.getCfg();
  let fileId = null, name = null;
  if (msg.sticker) {
    if (!msg.sticker.is_animated) return api('sendMessage', { chat_id: chat, ...C.msgOf(cfg, 'not_animated') });
    fileId = msg.sticker.file_id; name = (msg.sticker.set_name || 'sticker') + '.tgs';
  } else if (msg.document) {
    const n = (msg.document.file_name || '').toLowerCase();
    if (n.endsWith('.tgs') || n.endsWith('.json')) { fileId = msg.document.file_id; name = msg.document.file_name; }
  }

  if (!fileId) return api('sendMessage', { chat_id: chat, ...C.msgOf(cfg, 'welcome') });

  const url = `${appUrl()}/?f=${encodeURIComponent(fileId)}&n=${encodeURIComponent(name)}`;
  return api('sendMessage', {
    chat_id: chat, reply_to_message_id: msg.message_id, ...C.msgOf(cfg, 'ready'),
    reply_markup: { inline_keyboard: [[C.btn(cfg, 'btn_edit', { web_app: { url } })]] }
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

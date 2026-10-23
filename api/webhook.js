const { api, OWNER_ID } = require('../lib/tg');

const appUrl = () => (process.env.APP_URL || '').replace(/\/$/, '');

// User tapped "Can't render? Send to admin" under an exported file
async function handleCallback(cq) {
  const answer = (text, alert) => api('answerCallbackQuery', { callback_query_id: cq.id, text, show_alert: !!alert });
  if (cq.data !== 'cr' || !cq.message) return answer();
  const m = cq.message, u = cq.from;

  const copy = await api('copyMessage', { chat_id: OWNER_ID, from_chat_id: m.chat.id, message_id: m.message_id });
  if (!copy.ok) return answer('❌ Could not send to admin, try again later', true);

  const who = [u.first_name, u.last_name].filter(Boolean).join(' ') + (u.username ? ' @' + u.username : '');
  await api('sendMessage', {
    chat_id: OWNER_ID,
    reply_to_message_id: copy.result.message_id,
    text: `🆘 Can't render\n👤 ${who}\nuid:${u.id}\n\n↩️ Reply to THIS message with the fixed .tgs / .json and the bot will deliver it to the user.`
  });
  // remove the button so it can't be spammed
  await api('editMessageReplyMarkup', { chat_id: m.chat.id, message_id: m.message_id, reply_markup: { inline_keyboard: [] } });
  return answer('✅ Sent to admin. The fixed file will arrive here.', true);
}

// Owner replied to a "Can't render" notice with a fixed file -> deliver to that user
async function handleOwnerReply(msg) {
  const m = ((msg.reply_to_message && msg.reply_to_message.text) || '').match(/uid:(\d+)/);
  if (!m || !(msg.sticker || msg.document)) return false;
  const r = await api('copyMessage', {
    chat_id: m[1], from_chat_id: msg.chat.id, message_id: msg.message_id,
    ...(msg.document ? { caption: '✅ Fixed by Magic Mall' } : {})
  });
  if (r.ok && msg.sticker) await api('sendMessage', { chat_id: m[1], text: '✅ Fixed by Magic Mall' });
  await api('sendMessage', {
    chat_id: msg.chat.id, reply_to_message_id: msg.message_id,
    text: r.ok ? '✅ Delivered to user' : '❌ Failed: ' + r.description
  });
  return true;
}

async function handle(msg) {
  const chat = msg.chat.id;
  if (msg.from && String(msg.from.id) === String(OWNER_ID) && msg.reply_to_message) {
    if (await handleOwnerReply(msg)) return;
  }

  let fileId = null, name = null;
  if (msg.sticker) {
    if (!msg.sticker.is_animated) {
      return api('sendMessage', { chat_id: chat, text: '⚠️ Only animated stickers (.tgs) can be colour-edited.' });
    }
    fileId = msg.sticker.file_id; name = (msg.sticker.set_name || 'sticker') + '.tgs';
  } else if (msg.document) {
    const n = (msg.document.file_name || '').toLowerCase();
    if (n.endsWith('.tgs') || n.endsWith('.json')) { fileId = msg.document.file_id; name = msg.document.file_name; }
  }

  if (!fileId) {
    return api('sendMessage', {
      chat_id: chat,
      text: '👋 Welcome to *Magic Mall Colour Editor*\n\nSend me a `.tgs` sticker or Lottie `.json` file and I will open the editor for you.',
      parse_mode: 'Markdown'
    });
  }

  const url = `${appUrl()}/?f=${encodeURIComponent(fileId)}&n=${encodeURIComponent(name)}`;
  return api('sendMessage', {
    chat_id: chat,
    reply_to_message_id: msg.message_id,
    text: `🎨 File ready.\nTap the button, edit colours, then Export. The result is sent back here.`,
    reply_markup: { inline_keyboard: [[{ text: '🎨 Edit Colours', web_app: { url } }]] }
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

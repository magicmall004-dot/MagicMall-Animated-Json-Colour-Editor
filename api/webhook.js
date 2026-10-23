const { api, CHANNEL, CHANNEL_URL } = require('../lib/tg');

const appUrl = () => (process.env.APP_URL || '').replace(/\/$/, '');
const channelRow = [{ text: '📢 @' + CHANNEL, url: CHANNEL_URL }];

async function handle(msg) {
  const chat = msg.chat.id;
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
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [channelRow] }
    });
  }

  const url = `${appUrl()}/?f=${encodeURIComponent(fileId)}&n=${encodeURIComponent(name)}`;
  return api('sendMessage', {
    chat_id: chat,
    reply_to_message_id: msg.message_id,
    text: `🎨 File ready.\nTap the button, edit colours, then Export. The result is sent back here.`,
    reply_markup: { inline_keyboard: [[{ text: '🎨 Edit Colours', web_app: { url } }], channelRow] }
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(200).send('ok');
  if (req.headers['x-telegram-bot-api-secret-token'] !== process.env.WEBHOOK_SECRET) return res.status(401).end();
  try { const msg = req.body && req.body.message; if (msg) await handle(msg); }
  catch (e) { console.error('webhook error', e); }
  res.status(200).json({ ok: true });
};

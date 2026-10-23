// Open once (and again after updates): https://YOUR-APP.vercel.app/api/setup?key=WEBHOOK_SECRET
const { api } = require('../lib/tg');
const store = require('../lib/store');

module.exports = async (req, res) => {
  if (!process.env.WEBHOOK_SECRET || req.query.key !== process.env.WEBHOOK_SECRET) return res.status(401).send('bad key');
  const base = (process.env.APP_URL || `https://${req.headers.host}`).replace(/\/$/, '');
  const out = await api('setWebhook', {
    url: base + '/api/webhook', secret_token: process.env.WEBHOOK_SECRET,
    allowed_updates: ['message', 'callback_query'], drop_pending_updates: true
  });
  const info = await api('getWebhookInfo', {});
  res.status(200).json({
    webhook: base + '/api/webhook', result: out,
    allowed_updates: info.result && info.result.allowed_updates,
    last_error: info.result && info.result.last_error_message || null,
    storage_connected: store.enabled()
  });
};

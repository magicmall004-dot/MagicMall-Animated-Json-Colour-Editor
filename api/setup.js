// Open once in browser: https://YOUR-APP.vercel.app/api/setup?key=WEBHOOK_SECRET
const { api } = require('../lib/tg');

module.exports = async (req, res) => {
  if (!process.env.WEBHOOK_SECRET || req.query.key !== process.env.WEBHOOK_SECRET) return res.status(401).send('bad key');
  const base = (process.env.APP_URL || `https://${req.headers.host}`).replace(/\/$/, '');
  const out = await api('setWebhook', {
    url: base + '/api/webhook',
    secret_token: process.env.WEBHOOK_SECRET,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true
  });
  res.status(200).json({ webhook: base + '/api/webhook', result: out });
};

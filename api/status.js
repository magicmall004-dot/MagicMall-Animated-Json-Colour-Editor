const { verifyInitData } = require('../lib/tg');
const { draft } = require('../lib/status');

module.exports = async (req, res) => {
  const user = verifyInitData(req.headers['x-init-data']);
  if (!user) return res.status(401).end();
  const b = req.body || {}, id = Math.abs(parseInt(b.id, 10)) || 0;
  if (id && b.job) await draft(user.id, id, b.job);
  res.status(200).json({ ok: true });
};

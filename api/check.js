const { verifyInitData, isMember, CHANNEL } = require('../lib/tg');

module.exports = async (req, res) => {
  const user = verifyInitData(req.headers['x-init-data']);
  if (!user) return res.status(401).json({ error: 'auth' });
  const m = await isMember(user.id);
  res.status(200).json({ member: m.member, channel: CHANNEL, error: m.error || null });
};

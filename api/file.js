const { api, verifyInitData, TOKEN } = require('../lib/tg');

module.exports = async (req, res) => {
  if (!verifyInitData(req.headers['x-init-data'])) return res.status(401).json({ error: 'auth' });
  const id = req.query.id; if (!id) return res.status(400).json({ error: 'id' });
  const g = await api('getFile', { file_id: id });
  if (!g.ok) return res.status(404).json({ error: 'file not found' });
  const r = await fetch(`https://api.telegram.org/file/bot${TOKEN}/${g.result.file_path}`);
  if (!r.ok) return res.status(502).json({ error: 'download failed' });
  res.setHeader('content-type', 'application/octet-stream');
  res.status(200).send(Buffer.from(await r.arrayBuffer()));
};

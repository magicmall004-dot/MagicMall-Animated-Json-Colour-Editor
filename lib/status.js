// Live export status shown in the user's chat with sendMessageDraft (Bot API 9.3+)
const { TOKEN } = require('./tg');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function render(j) {
  const p = Math.max(0, Math.min(100, Math.round(+j.pct || 0))), n = Math.round(p / 100 * 24), line = '─'.repeat(30);
  const tree = (j.tree || []).slice(0, 8).map((x) => esc(String(x).slice(0, 60))).join('\n');
  return `<pre><code class="language-diff">${esc(String(j.title || 'export').slice(0, 80))}\n${tree}\n${line}\n  ${esc(String(j.stage || '').slice(0, 40))}\n  ${esc(String(j.detail || '').slice(0, 80))}\n${line}\n[${'█'.repeat(n)}${'░'.repeat(24 - n)}] ${String(p).padStart(3)}%\n${line}</code></pre>`;
}
async function draft(chat, id, job) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessageDraft`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, draft_id: id, text: render(job), parse_mode: 'HTML' }), signal: AbortSignal.timeout(2500)
    });
    return (await r.json()).ok;
  } catch { return false; }
}
module.exports = { render, draft };

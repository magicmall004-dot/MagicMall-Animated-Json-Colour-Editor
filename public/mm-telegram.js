/* Telegram-only gate + channel join check + send export via bot */
(function () {
  const CHANNEL = 'magicmall_emoji';
  const tg = window.Telegram && window.Telegram.WebApp;
  const MAX = 4 * 1024 * 1024;

  const css = document.createElement('style');
  css.textContent = '#browserWarning{display:none!important}' +
    '#mmGate{position:fixed;inset:0;z-index:100000;background:#080e1a;color:#fff;display:flex;align-items:center;justify-content:center;padding:24px;font-family:DM Sans,sans-serif}' +
    '#mmGate .box{max-width:340px;text-align:center}#mmGate .ic{font-size:54px;margin-bottom:10px}' +
    '#mmGate h2{margin:0 0 8px;font-size:20px}#mmGate p{margin:0 0 18px;opacity:.75;font-size:14px;line-height:1.5}' +
    '#mmGate button{display:block;width:100%;padding:13px;border:0;border-radius:12px;font:700 14px DM Sans,sans-serif;margin-top:10px;cursor:pointer;color:#fff;background:linear-gradient(135deg,#2AABEE,#1a8bbf)}' +
    '#mmGate button.alt{background:#ffffff22}#mmGate small{display:block;margin-top:12px;opacity:.5;font-size:11px}';
  document.head.appendChild(css);

  function gate(icon, title, text, buttons, small) {
    let g = document.getElementById('mmGate');
    if (!g) { g = document.createElement('div'); g.id = 'mmGate'; document.body.appendChild(g); }
    g.innerHTML = '<div class="box"><div class="ic">' + icon + '</div><h2>' + title + '</h2><p>' + text + '</p></div>';
    const box = g.firstChild;
    (buttons || []).forEach(b => { const el = document.createElement('button'); el.textContent = b.t; if (b.alt) el.className = 'alt'; el.onclick = b.f; box.appendChild(el); });
    if (small) { const s = document.createElement('small'); s.textContent = small; box.appendChild(s); }
  }
  const hideGate = () => { const g = document.getElementById('mmGate'); if (g) g.remove(); };

  // 1) Only inside Telegram Mini App
  if (!tg || !tg.initData) {
    gate('🔒', 'Open in Telegram', 'This editor works only inside the Magic Mall Telegram bot. Send your .tgs or .json file to the bot and tap “Edit Colours”.');
    return;
  }
  tg.ready(); tg.expand();
  const initData = tg.initData;

  function toast(msg, ms) {
    let t = document.getElementById('mmToast');
    if (!t) {
      t = document.createElement('div'); t.id = 'mmToast';
      t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#111c;color:#fff;padding:10px 16px;border-radius:12px;font:600 13px DM Sans,sans-serif;z-index:99999;backdrop-filter:blur(8px);max-width:90%;text-align:center';
      document.body.appendChild(t);
    }
    t.textContent = msg; t.style.display = 'block';
    clearTimeout(t._h); t._h = setTimeout(() => (t.style.display = 'none'), ms || 3500);
  }

  // Smaller JSON: no indentation + rounded numbers (same trick the TGS export uses)
  window.exportJson = function () {
    if (!animData) return;
    const txt = JSON.stringify(animData, (k, v) => (typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : v));
    window.doDownload(new Blob([txt], { type: 'application/json' }), baseName() + '-edited.json');
  };

  // Every export goes through doDownload -> gzip -> send via bot (once)
  let sending = false;
  window.doDownload = async function (blob, filename) {
    if (sending) return;
    sending = true;
    toast('Sending to bot… (can take up to 40 s, please wait)', 60000);
    try {
      let body = new Uint8Array(await blob.arrayBuffer());
      const headers = { 'x-init-data': initData, 'x-filename': encodeURIComponent(filename), 'content-type': 'application/octet-stream' };
      // transparent GIF / WebM -> bot wraps it in a .zip so Telegram keeps the alpha
      const transparent = (/\.gif$/i.test(filename) && gifSettings.background === 'transparent') ||
                          (/\.webm$/i.test(filename) && mp4Cfg.transparent);
      if (transparent) headers['x-zip'] = '1';
      if (body.length > 100 * 1024) {
        const gz = window.pako.gzip(body, { level: 9 });
        if (gz.length < body.length) { body = gz; headers['x-gzip'] = '1'; }
      }
      if (body.length > MAX) throw new Error('File too big (' + (body.length / 1048576).toFixed(1) + ' MB after compression, max 4 MB)');
      const r = await fetch('/api/send', { method: 'POST', headers, body });
      if (r.status === 403) { checkJoin(); throw new Error('Join the channel first'); }
      if (!r.ok) throw new Error((await r.text()) || r.status);
      const j = await r.json().catch(() => ({}));
      if (j.pending) { toast('⏳ Telegram is slow. It will arrive in your bot chat soon, please do not send again.', 9000); return; }
      if (j.dup) { toast('ℹ️ This file was just sent, check your bot chat.', 6000); return; }
      toast(j.sticker === false ? '⚠️ Sent as a file: Telegram can’t render it as a sticker' : '✅ Sent! Check your bot chat');
      if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    } catch (e) { toast('❌ ' + e.message); }
    finally { setTimeout(() => (sending = false), 1500); }
  };

  // Channel header button
  const b = document.getElementById('telegramBtn');
  if (b) { const nb = b.cloneNode(true); b.replaceWith(nb); nb.addEventListener('click', () => tg.openTelegramLink('https://t.me/' + CHANNEL)); }

  // Load the file the user sent to the bot
  let loaded = false;
  function loadFile() {
    if (loaded) return; loaded = true;
    const q = new URLSearchParams(location.search);
    const fid = q.get('f'); if (!fid) return;
    const name = q.get('n') || 'sticker.tgs';
    fetch('/api/file?id=' + encodeURIComponent(fid), { headers: { 'x-init-data': initData } })
      .then(r => { if (!r.ok) throw new Error('load ' + r.status); return r.blob(); })
      .then(blob => window.loadFiles([new File([blob], name)]))
      .catch(e => toast('❌ Could not load file: ' + e.message));
  }

  // 2) Channel membership gate
  async function checkJoin() {
    gate('⏳', 'Checking…', 'Please wait');
    try {
      const r = await fetch('/api/check', { headers: { 'x-init-data': initData } });
      const d = await r.json();
      if (d.member) { hideGate(); loadFile(); return; }
      gate('📢', 'Join our channel first', 'To use the editor, join @' + CHANNEL + ' then tap “I joined”.', [
        { t: '📢 Join @' + CHANNEL, f: () => tg.openTelegramLink('https://t.me/' + CHANNEL) },
        { t: '✅ I joined', alt: true, f: checkJoin }
      ], d.error ? 'Setup issue: ' + d.error : '');
    } catch (e) {
      gate('⚠️', 'Connection error', e.message, [{ t: 'Try again', f: checkJoin }]);
    }
  }
  checkJoin();
})();

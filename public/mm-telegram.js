/* Telegram Mini App glue: load file from bot, send export back via bot */
(function () {
  const tg = window.Telegram && window.Telegram.WebApp;
  if (!tg || !tg.initData) return; // normal browser: editor works as before
  tg.ready(); tg.expand();
  const st = document.createElement('style'); st.textContent = '#browserWarning{display:none!important}'; document.head.appendChild(st);
  const initData = tg.initData;
  const MAX = 4 * 1024 * 1024;

  function toast(msg) {
    let t = document.getElementById('mmToast');
    if (!t) {
      t = document.createElement('div'); t.id = 'mmToast';
      t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#111c;color:#fff;padding:10px 16px;border-radius:12px;font:600 13px DM Sans,sans-serif;z-index:99999;backdrop-filter:blur(8px);max-width:90%;text-align:center';
      document.body.appendChild(t);
    }
    t.textContent = msg; t.style.display = 'block';
    clearTimeout(t._h); t._h = setTimeout(() => (t.style.display = 'none'), 3500);
  }

  // Every export (JSON / TGS / GIF / MP4) goes through doDownload -> send via bot
  const nativeDownload = window.doDownload;
  window.doDownload = async function (blob, filename) {
    if (blob.size > MAX) {
      alert('File is ' + (blob.size / 1048576).toFixed(1) + ' MB. Bot send limit is 4 MB, saving normally instead.');
      return nativeDownload(blob, filename);
    }
    toast('Sending to bot…');
    try {
      const r = await fetch('/api/send', {
        method: 'POST',
        headers: { 'x-init-data': initData, 'x-filename': encodeURIComponent(filename), 'content-type': 'application/octet-stream' },
        body: blob
      });
      if (!r.ok) throw new Error((await r.text()) || r.status);
      toast('✅ Sent! Check your bot chat');
      if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    } catch (e) {
      toast('❌ Send failed: ' + e.message);
    }
  };

  // Channel button -> open inside Telegram
  const b = document.getElementById('telegramBtn');
  if (b) {
    const nb = b.cloneNode(true); b.replaceWith(nb);
    nb.addEventListener('click', () => tg.openTelegramLink('https://t.me/magicmall_emoji'));
  }

  // Auto-load the file the user sent to the bot
  const q = new URLSearchParams(location.search);
  const fid = q.get('f');
  if (fid) {
    const name = q.get('n') || 'sticker.tgs';
    fetch('/api/file?id=' + encodeURIComponent(fid), { headers: { 'x-init-data': initData } })
      .then(r => { if (!r.ok) throw new Error('load ' + r.status); return r.blob(); })
      .then(blob => window.loadFiles([new File([blob], name)]))
      .catch(e => toast('❌ Could not load file: ' + e.message));
  }
})();

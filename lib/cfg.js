// Customizable bot texts + buttons (defaults here, owner overrides stored in Redis)
const store = require('./store');

const MSG = {
  welcome:        { name: 'Welcome message (/start)',            max: 4000, text: '👋 Welcome to Magic Mall Colour Editor\n\nSend me a premium emoji, a .tgs sticker or a Lottie .json file and I will open the editor for you.' },
  ready:          { name: '“File ready” message',                 max: 4000, text: '🎨 File ready.\nTap the button, edit colours, then Export. The result is sent back here.' },
  emoji_none:     { name: 'Warning: emoji has no animation',      max: 4000, text: '⚠️ I could not find an animated version of that emoji.\nSend a premium (animated) emoji, a .tgs sticker or a .json file.' },
  not_animated:   { name: 'Warning: sticker is not animated',     max: 4000, text: '⚠️ Only animated stickers (.tgs) can be colour-edited.' },
  sent_admin:     { name: 'After user taps “Can’t render”',       max: 4000, text: '✅ Sent to admin. The fixed file will arrive here.' },
  not_sticker:    { name: 'Warning: file cannot render as sticker', max: 800, text: '⚠️ Telegram can’t render this animation as a sticker.\nTap the button below and the admin will fix it for you.' },
  fixed:          { name: 'Caption when you deliver a fixed file',max: 1000, text: '✅ Fixed by Magic Mall' },
  export_caption: { name: 'Caption under exported files',         max: 900,  text: '✅ Edited with Magic Mall Colour Editor\n📢 @magicmall_emoji' }
};
const BTN = {
  btn_edit: { name: '“Edit Colours” button',     label: 'Edit Colours',                 emoji: '🎨' },
  btn_cr:   { name: '“Can’t render” button',     label: "Can't render? Send to admin",  emoji: '⚠️' }
};

async function getCfg() {
  const saved = (await store.get('cfg')) || {};
  const cfg = {};
  for (const k in MSG) cfg[k] = { text: MSG[k].text, entities: [], ...(saved[k] || {}) };
  for (const k in BTN) cfg[k] = { label: BTN[k].label, emoji: BTN[k].emoji, icon: null, ...(saved[k] || {}) };
  return cfg;
}
async function saveItem(key, val) {
  const saved = (await store.get('cfg')) || {};
  if (val === null) delete saved[key]; else saved[key] = val;
  await store.set('cfg', saved);
}
async function resetAll() { await store.del('cfg'); await store.del('state'); }

const msgOf = (cfg, k) => ({ text: cfg[k].text, ...(cfg[k].entities && cfg[k].entities.length ? { entities: cfg[k].entities } : {}) });
const capOf = (cfg, k) => ({ caption: cfg[k].text, ...(cfg[k].entities && cfg[k].entities.length ? { caption_entities: cfg[k].entities } : {}) });

// Inline button: always "primary" style; premium emoji as icon, else normal emoji in front of the label
function btn(cfg, k, extra) {
  const c = cfg[k];
  const b = { text: (!c.icon && c.emoji ? c.emoji + ' ' : '') + c.label, style: 'primary', ...extra };
  if (c.icon) b.icon_custom_emoji_id = String(c.icon);
  return b;
}

module.exports = { MSG, BTN, getCfg, saveItem, resetAll, msgOf, capOf, btn };

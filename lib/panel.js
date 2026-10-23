// Owner panel (inside the bot chat): customize messages + buttons
const { api, OWNER_ID } = require('./tg');
const store = require('./store');
const C = require('./cfg');

const B = (text, data) => ({ text, callback_data: data, style: 'primary' });
const say = (chat, text, extra = {}) => api('sendMessage', { chat_id: chat, text, ...extra });
const NO_STORE = '⚠️ Storage is not connected yet.\nVercel → your project → Storage → create “Upstash Redis” → Connect to this project → Redeploy. Then open /panel again.';

async function showMenu(chat) {
  if (!store.enabled()) return say(chat, NO_STORE);
  const rows = [];
  for (const k in C.MSG) rows.push([B('✏️ ' + C.MSG[k].name, 'p:' + k)]);
  for (const k in C.BTN) rows.push([B('🔘 ' + C.BTN[k].name, 'p:' + k)]);
  rows.push([B('♻️ Reset everything', 'pr')]);
  return say(chat, '⚙️ Owner panel\n\nPick what to customize. Premium emoji and formatting you send are kept.', { reply_markup: { inline_keyboard: rows } });
}

// Owner tapped a panel button
async function callback(cq) {
  const chat = cq.message.chat.id, d = cq.data;
  if (!store.enabled()) return say(chat, NO_STORE);
  const cfg = await C.getCfg();
  if (d === 'pr') { await C.resetAll(); return say(chat, '♻️ Everything is back to default.'); }
  const parts = d.split(':');
  if (parts[0] === 'p') {
    const key = parts[1];
    if (C.MSG[key]) {
      await store.set('state', { a: key }, 3600);
      await say(chat, '👇 Current: ' + C.MSG[key].name);
      await api('sendMessage', { chat_id: chat, ...C.msgOf(cfg, key) });
      return say(chat, 'Send the NEW message now (premium emoji and formatting are kept).\n\n/reset = back to default\n/cancel = stop');
    }
    if (C.BTN[key]) {
      return say(chat, '🔘 ' + C.BTN[key].name + '\nCurrent look:', {
        reply_markup: { inline_keyboard: [[C.btn(cfg, key, { callback_data: 'noop' })], [B('✏️ Label', `pb:${key}:l`), B('😀 Emoji', `pb:${key}:e`)], [B('♻️ Reset button', `pb:${key}:r`)]] }
      });
    }
  }
  if (parts[0] === 'pb' && C.BTN[parts[1]]) {
    const [, key, sub] = parts;
    if (sub === 'r') { await C.saveItem(key, null); return say(chat, '♻️ Button reset.'); }
    await store.set('state', { a: key + ':' + sub }, 3600);
    return say(chat, sub === 'l'
      ? 'Send the new button label (plain text, max 30 characters).\n\n/reset = default, /cancel = stop'
      : 'Send ONE of these:\n• a premium emoji (used as the button icon)\n• the premium emoji ID (numbers)\n• a normal emoji\n\n/none = no emoji, /cancel = stop');
  }
}

// Owner sent text while the panel is waiting for input. Returns true if handled.
async function input(msg) {
  const st = await store.get('state');
  if (!st || !st.a) return false;
  const chat = msg.chat.id;
  const text = (msg.text || msg.caption || '').trim();
  const ents = msg.entities || msg.caption_entities || [];
  if (text === '/cancel') { await store.del('state'); await say(chat, '✖️ Cancelled.'); return true; }

  const [key, sub] = st.a.split(':');
  const cfg = await C.getCfg();
  try {
    if (C.MSG[key]) {
      if (text === '/reset') { await C.saveItem(key, null); await store.del('state'); await say(chat, '♻️ Back to default.'); return true; }
      if (!text) { await say(chat, 'Please send text (or /cancel).'); return true; }
      if (text.length > C.MSG[key].max) { await say(chat, `Too long (${text.length}). Max ${C.MSG[key].max} characters for this one.`); return true; }
      const pv = await api('sendMessage', { chat_id: chat, text, ...(ents.length ? { entities: ents } : {}) });
      if (!pv.ok) { await say(chat, '❌ Telegram refused it: ' + pv.description + '\n(Premium emoji need the bot OWNER account to have Telegram Premium.)'); return true; }
      await C.saveItem(key, { text, entities: ents });
      await store.del('state');
      await say(chat, '✅ Saved. That is how it looks (above).');
      return true;
    }

    // buttons
    let patch, label = cfg[key].label, emoji = cfg[key].emoji, icon = cfg[key].icon;
    if (sub === 'l') {
      if (text === '/reset') { label = C.BTN[key].label; }
      else if (!text) { await say(chat, 'Please send text (or /cancel).'); return true; }
      else label = text.slice(0, 30);
    } else {
      if (text === '/none') { emoji = ''; icon = null; }
      else {
        const ce = ents.find(e => e.type === 'custom_emoji');
        if (ce) { icon = ce.custom_emoji_id; emoji = ''; }
        else if (/^\d{10,}$/.test(text)) { icon = text; emoji = ''; }
        else if (text) { emoji = text.slice(0, 8); icon = null; }
        else { await say(chat, 'Send an emoji (or /cancel).'); return true; }
      }
    }
    const test = { ...cfg, [key]: { ...cfg[key], label, emoji, icon } };
    const pv = await api('sendMessage', { chat_id: chat, text: 'Preview 👇', reply_markup: { inline_keyboard: [[C.btn(test, key, { callback_data: 'noop' })]] } });
    if (!pv.ok) { await say(chat, '❌ Telegram refused it: ' + pv.description + '\n(Premium emoji need the bot OWNER account to have Telegram Premium.)'); return true; }
    await C.saveItem(key, { label, emoji, icon });
    await store.del('state');
    await say(chat, '✅ Saved.');
    return true;
  } catch (e) {
    await say(chat, '❌ Could not save: ' + e.message);
    return true;
  }
}

module.exports = { showMenu, callback, input };

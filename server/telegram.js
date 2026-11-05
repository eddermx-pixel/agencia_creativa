// Notificaciones y aprobaciones por Telegram (bot propio vía @BotFather).
// Botones para autorizar / aprobar piezas, y respuestas escritas
// contestando (reply) al mensaje del agente.
import { bus, answerRequest, judgePiece } from './hub.js';
import { db } from './store.js';
import { byId } from './roster.js';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_CHAT_ID;
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
const KEY = process.env.ACCESS_KEY;

const msgFor = new Map(); // id de solicitud/pieza -> message_id
const refFor = new Map(); // message_id -> { kind, id }

async function api(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) console.warn(`[telegram] ${method}:`, json.description);
  return json;
}

function link(path) {
  if (!PUBLIC_URL) return '';
  const [base, hash] = path.split('#');
  const q = KEY ? `${base.includes('?') ? '&' : '?'}key=${encodeURIComponent(KEY)}` : '';
  return `${PUBLIC_URL}${base}${q}${hash ? `#${hash}` : ''}`;
}
const quien = (id) => (byId[id] ? `${byId[id].nombre} (${byId[id].rol})` : id);

async function send(kind, id, text, keyboard) {
  const r = await api('sendMessage', {
    chat_id: CHAT, text, parse_mode: 'HTML', disable_web_page_preview: true,
    reply_markup: keyboard ? { inline_keyboard: keyboard } : undefined,
  });
  if (r.ok) {
    msgFor.set(id, r.result.message_id);
    refFor.set(r.result.message_id, { kind, id });
  }
}

async function markDone(id, note) {
  const mid = msgFor.get(id);
  if (!mid) return;
  await api('editMessageReplyMarkup', { chat_id: CHAT, message_id: mid, reply_markup: { inline_keyboard: [] } });
  await api('sendMessage', { chat_id: CHAT, text: note, reply_to_message_id: mid });
  msgFor.delete(id);
}

const h = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

function onRequest(r) {
  if (r.estado !== 'pendiente') {
    const nota = { autorizacion: r.aprobado ? '✅ Autorizado' : '❌ No autorizado', concepto: r.aprobado ? '✅ Concepto aprobado' : `✏️ Cambios pedidos: ${r.respuesta}`, cuestionario: '✅ Cuestionario respondido' }[r.tipo] || `💬 Respondido: ${r.respuesta}`;
    return markDone(r.id, nota);
  }
  const oficina = link('/');
  if (r.tipo === 'cuestionario') {
    const qs = r.preguntas.map((p, i) => `<b>${i + 1}.</b> ${h(p.pregunta)}${p.opciones?.length ? `\n   <i>(${h(p.opciones.join(' / '))})</i>` : ''}`).join('\n\n');
    return send('r', r.id,
      `📝 <b>${h(quien(r.agente))}</b> tiene preguntas antes de empezar:\n${h(r.texto)}\n\n${qs}\n\n<i>Responde a este mensaje con una línea por pregunta (1. …, 2. …)${oficina ? `, o hazlo en la <a href="${oficina}">oficina</a>` : ''}.</i>`);
  }
  if (r.tipo === 'concepto') {
    return send('r', r.id,
      `💡 <b>${h(quien(r.agente))}</b> presenta el concepto: <b>${h(r.texto)}</b>\n\n${h(r.detalle).slice(0, 3200)}\n\n<i>Para pedir cambios, responde a este mensaje.</i>`,
      [[{ text: '✅ Aprobar concepto', callback_data: `r:${r.id}:1` }]]);
  }
  if (r.tipo === 'autorizacion') {
    return send('r', r.id,
      `🔐 <b>${h(quien(r.agente))}</b> pide autorización:\n\n${h(r.texto)}${r.detalle ? `\n<i>${h(r.detalle)}</i>` : ''}${oficina ? `\n\n<a href="${oficina}">Abrir oficina</a>` : ''}`,
      [[{ text: '✅ Autorizar', callback_data: `r:${r.id}:1` }, { text: '❌ No', callback_data: `r:${r.id}:0` }]]);
  }
  const kb = (r.opciones || []).slice(0, 4).map((o, i) => [{ text: o.slice(0, 60), callback_data: `q:${r.id}:${i}` }]);
  return send('r', r.id,
    `❓ <b>${h(quien(r.agente))}</b> pregunta:\n\n${h(r.texto)}\n\n<i>${kb.length ? 'Elige una opción o responde' : 'Responde'} a este mensaje para escribir tu respuesta.</i>`,
    kb.length ? kb : null);
}

function onPiece(p) {
  if (p.estado !== 'pendiente') return markDone(p.id, p.estado === 'aprobada' ? '✅ Aprobada' : `❌ Rechazada${p.comentario ? `: ${p.comentario}` : ''}`);
  const feed = link(`/feed.html#${p.id}`);
  const icon = { arte: '🎨', video: '🎬', texto: '✍️' }[p.tipo] || '📦';
  const preview = p.tipo === 'texto' ? `\n\n${h(p.contenido.slice(0, 700))}` : '';
  return send('p', p.id,
    `${icon} <b>${h(quien(p.agente))}</b> entregó: <b>${h(p.titulo)}</b>\n${h(p.descripcion || '')}${preview}${feed ? `\n\n👉 <a href="${feed}">Verla en el feed</a>` : ''}\n\n<i>Para rechazar con comentario, responde a este mensaje.</i>`,
    [[{ text: '✅ Aprobar', callback_data: `p:${p.id}:1` }, { text: '❌ Rechazar', callback_data: `p:${p.id}:0` }]]);
}

async function handle(update) {
  if (update.callback_query) {
    const cq = update.callback_query;
    if (String(cq.message?.chat?.id) !== String(CHAT)) return;
    const [kind, id, val] = cq.data.split(':');
    let ok = null;
    if (kind === 'r') ok = answerRequest(id, { aprobado: val === '1', via: 'telegram' });
    if (kind === 'q') {
      const r = db.requests.find((x) => x.id === id);
      ok = r && answerRequest(id, { respuesta: r.opciones[Number(val)], via: 'telegram' });
    }
    if (kind === 'p') ok = judgePiece(id, { aprobado: val === '1', via: 'telegram' });
    await api('answerCallbackQuery', { callback_query_id: cq.id, text: ok ? 'Listo ✅' : 'Ya estaba resuelto' });
    return;
  }
  const m = update.message;
  if (!m?.text) return;
  if (m.text.startsWith('/start')) {
    await api('sendMessage', { chat_id: m.chat.id, text: `Hola 👋 Tu TELEGRAM_CHAT_ID es: ${m.chat.id}\nPonlo en el archivo .env y reinicia la agencia.` });
    return;
  }
  if (String(m.chat.id) !== String(CHAT)) return;
  const ref = m.reply_to_message && refFor.get(m.reply_to_message.message_id);
  if (!ref) return;
  if (ref.kind === 'r') {
    const r = db.requests.find((x) => x.id === ref.id);
    if (r?.tipo === 'autorizacion') answerRequest(ref.id, { aprobado: !/^\s*no\b/i.test(m.text), respuesta: m.text, via: 'telegram' });
    else if (r?.tipo === 'concepto') answerRequest(ref.id, { aprobado: false, respuesta: m.text, via: 'telegram' });
    else if (r?.tipo === 'cuestionario') {
      // "1. ... / 2. ..." → una respuesta por pregunta; si no viene numerado, todo va a la primera.
      const partes = m.text.split(/\n(?=\s*\d+[.)-])/).map((x) => x.replace(/^\s*\d+[.)-]\s*/, '').trim());
      const respuestas = partes.length >= 2 ? partes : [m.text];
      answerRequest(ref.id, { respuestas, via: 'telegram' });
    } else answerRequest(ref.id, { respuesta: m.text, via: 'telegram' });
  } else {
    judgePiece(ref.id, { aprobado: false, comentario: m.text, via: 'telegram' });
  }
}

export function startTelegram() {
  if (!TOKEN) {
    console.log('[telegram] Sin TELEGRAM_BOT_TOKEN: notificaciones desactivadas.');
    return false;
  }
  if (CHAT) {
    bus.on('request', (r) => onRequest(r).catch((e) => console.warn('[telegram]', e.message)));
    bus.on('piece', (p) => onPiece(p).catch((e) => console.warn('[telegram]', e.message)));
  } else {
    console.log('[telegram] Falta TELEGRAM_CHAT_ID: escríbele /start a tu bot para obtenerlo.');
  }
  let offset = 0;
  (async function poll() {
    for (;;) {
      try {
        const r = await api('getUpdates', { offset, timeout: 30, allowed_updates: ['message', 'callback_query'] });
        for (const u of r.result || []) {
          offset = u.update_id + 1;
          await handle(u).catch((e) => console.warn('[telegram]', e.message));
        }
      } catch (e) {
        console.warn('[telegram] reintentando:', e.message);
        await new Promise((res) => setTimeout(res, 5000));
      }
    }
  })();
  console.log('[telegram] Bot activo.');
  return true;
}

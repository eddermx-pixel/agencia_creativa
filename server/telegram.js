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
    const nota = { curso: r.aprobado ? '🎓 Curso aprobado' : 'Curso pospuesto', autorizacion: r.aprobado ? '✅ Autorizado' : '❌ No autorizado', concepto: r.aprobado ? '✅ Concepto aprobado' : `✏️ Cambios pedidos: ${r.respuesta}`, cuestionario: '✅ Cuestionario respondido' }[r.tipo] || `💬 Respondido: ${r.respuesta}`;
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
  if (r.tipo === 'autorizacion' || r.tipo === 'curso') {
    return send('r', r.id,
      `${r.tipo === 'curso' ? '🎓' : '🔐'} <b>${h(quien(r.agente))}</b> ${r.tipo === 'curso' ? 'quiere tomar un curso' : 'pide autorización'}:\n\n${h(r.texto)}${r.detalle ? `\n<i>${h(r.detalle)}</i>` : ''}${oficina ? `\n\n<a href="${oficina}">Abrir oficina</a>` : ''}`,
      [[{ text: '✅ Autorizar', callback_data: `r:${r.id}:1` }, { text: '❌ No', callback_data: `r:${r.id}:0` }]]);
  }
  const kb = (r.opciones || []).slice(0, 4).map((o, i) => [{ text: o.slice(0, 60), callback_data: `q:${r.id}:${i}` }]);
  return send('r', r.id,
    `❓ <b>${h(quien(r.agente))}</b> pregunta:\n\n${h(r.texto)}\n\n<i>${kb.length ? 'Elige una opción o responde' : 'Responde'} a este mensaje para escribir tu respuesta.</i>`,
    kb.length ? kb : null);
}

function onPiece(p) {
  if (p.estado !== 'pendiente') return markDone(p.id, p.estado === 'aprobada' ? '✅ Aprobada' : `❌ Rechazada${p.comentario ? `: ${p.comentario}` : ''}`);
  const feed = link(['v2', 'hf'].includes(p.motor) ? `/player.html?id=${p.id}` : `/feed.html#${p.id}`);
  const icon = { arte: '🎨', video: '🎬', texto: '✍️' }[p.tipo] || '📦';
  const preview = p.tipo === 'texto' ? `\n\n${h(p.contenido.slice(0, 700))}` : '';
  return send('p', p.id,
    `${icon} <b>${h(quien(p.agente))}</b> entregó: <b>${h(p.titulo)}</b>\n${h(p.descripcion || '')}${preview}${feed ? `\n\n👉 <a href="${feed}">Verla en el feed</a>` : ''}\n\n<i>Para rechazar con comentario, responde a este mensaje.</i>`,
    [[{ text: '✅ Aprobar', callback_data: `p:${p.id}:1` }, { text: '❌ Rechazar', callback_data: `p:${p.id}:0` }], ...(feed ? [[{ text: p.tipo === 'video' ? '🎬 Ver con sonido' : '👁️ Verla', url: feed }]] : [])]);
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
    if (ok?.campaignId) bus.emit('wake', ok.campaignId);
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
  const cidRef = (db.requests.find((x) => x.id === ref.id) || db.pieces.find((x) => x.id === ref.id))?.campaignId;
  setTimeout(() => cidRef && bus.emit('wake', cidRef), 500);
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

// Recordatorio (máx. 3) si algo sigue sin respuesta. RECORDATORIO_MIN=minutos (0 = apagado, por defecto 45)
const RECORD_MIN = Number(process.env.RECORDATORIO_MIN ?? 45);
const recordados = new Map();
function recordatorios() {
  if (!RECORD_MIN) return;
  setInterval(() => {
    const pend = [...db.requests.filter((r) => r.estado === 'pendiente').map((r) => ({ id: r.id, t: r.creada || r.t, x: r.texto })), ...db.pieces.filter((p) => p.estado === 'pendiente').map((p) => ({ id: p.id, t: p.creada, x: p.titulo }))];
    for (const it of pend) {
      const n = recordados.get(it.id) || { n: 0, t: it.t || Date.now() };
      if (n.n >= 3 || Date.now() - n.t < RECORD_MIN * 60000) { recordados.set(it.id, n); continue; }
      api('sendMessage', { chat_id: CHAT, text: `⏰ Sigues teniendo una decisión pendiente: ${it.x}`, reply_to_message_id: msgFor.get(it.id) }).catch(() => {});
      recordados.set(it.id, { n: n.n + 1, t: Date.now() });
    }
  }, 60000).unref?.();
}

export function startTelegram() {
  if (!TOKEN) {
    console.log('[telegram] Sin TELEGRAM_BOT_TOKEN: notificaciones desactivadas.');
    return false;
  }
  if (CHAT) {
    recordatorios();
    bus.on('request', (r) => onRequest(r).catch((e) => console.warn('[telegram]', e.message)));
    bus.on('piece', (p) => onPiece(p).catch((e) => console.warn('[telegram]', e.message)));
    bus.on('nuevo-cliente', (c) => {
      api('sendMessage', { chat_id: CHAT, text: `🆕 Nuevo cliente registrado por QR: ${c.nombre}\n${c.rubro || ''}${c.contacto?.whatsapp ? `\nWhatsApp: ${c.contacto.whatsapp}` : ''}${link('/clientes.html') ? `\n${link('/clientes.html')}` : ''}` }).catch(() => {});
    });
    bus.on('campaign', (c) => {
      if (c.estado !== 'error' || c.avisadoError === c.resumen) return;
      c.avisadoError = c.resumen;
      api('sendMessage', { chat_id: CHAT, text: `⚠️ La campaña de ${c.cliente} se detuvo: ${c.resumen || 'error'}\nEntra a la oficina y pulsa "Reintentar".${link('/') ? `\n${link('/')}` : ''}` }).catch(() => {});
    });
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

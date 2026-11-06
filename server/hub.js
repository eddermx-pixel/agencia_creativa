// El "centro" de la oficina: estado de cada agente, solicitudes al jefe,
// piezas para el feed y bitácora. Todo cambio se emite como evento para
// que la interfaz (WebSocket) y Telegram se enteren al instante.
import { EventEmitter } from 'node:events';
import { db, save, newId } from './store.js';
import * as ws from './workspace.js';
import * as entregables from './entregables.js';
import { ROSTER } from './roster.js';

export const bus = new EventEmitter();
bus.setMaxListeners(50);

export const agentState = Object.fromEntries(
  ROSTER.map((a) => [a.id, { id: a.id, estado: 'libre', burbuja: '', campaignId: null }]),
);

export function setAgent(id, patch) {
  Object.assign(agentState[id], patch);
  bus.emit('agent', agentState[id]);
}

export function log(agente, texto, campaignId = null) {
  const entry = { t: Date.now(), agente, texto: String(texto).slice(0, 500), campaignId };
  db.log.push(entry);
  if (db.log.length > 800) db.log.splice(0, db.log.length - 800);
  save();
  bus.emit('log', entry);
}

// ---- Solicitudes al jefe (preguntas y autorizaciones) ----
const requestWaiters = new Map();

// tipos: 'pregunta' | 'autorizacion' | 'cuestionario' (varias preguntas) | 'concepto' (idea para aprobar)
// `key` identifica la llamada que la originó: si el servidor se reinicia y el
// agente repite la misma llamada, se reutiliza la solicitud en vez de duplicarla.
export function askBoss({ tipo, agente, campaignId, texto, opciones = [], detalle = '', preguntas = [], key = null }) {
  const prev = key && db.requests.find((x) => x.key === key && x.estado !== 'expirada');
  if (prev) {
    if (prev.estado !== 'pendiente') return Promise.resolve(prev);
    return new Promise((resolve) => requestWaiters.set(prev.id, resolve));
  }
  const r = {
    id: newId('r'), key, tipo, agente, campaignId, texto, opciones, detalle, preguntas,
    estado: 'pendiente', creada: Date.now(),
  };
  db.requests.push(r);
  save();
  const verbo = { autorizacion: 'Pide autorización', cuestionario: 'Te hace preguntas', concepto: 'Presenta el concepto' }[tipo] || 'Pregunta';
  log(agente, `${verbo}: ${texto}`, campaignId);
  bus.emit('request', r);
  return new Promise((resolve) => requestWaiters.set(r.id, resolve));
}

export function answerRequest(id, { respuesta = '', aprobado = null, respuestas = null, via = 'web' }) {
  const r = db.requests.find((x) => x.id === id);
  if (!r || r.estado !== 'pendiente') return null;
  if (r.tipo === 'cuestionario' && Array.isArray(respuestas)) {
    respuesta = r.preguntas.map((p, i) => `${i + 1}. ${p.pregunta}\n   → ${String(respuestas[i] || '(sin respuesta)').slice(0, 1500)}`).join('\n');
  }
  Object.assign(r, { estado: 'respondida', respuesta, aprobado, via, respondida: Date.now() });
  save();
  const resumen = ['autorizacion', 'concepto'].includes(r.tipo)
    ? (aprobado ? 'APROBADO' : 'NO / CAMBIOS') + (respuesta ? ` — ${respuesta}` : '')
    : r.tipo === 'cuestionario' ? 'respondió el cuestionario' : respuesta;
  log('jefe', `Respondió a ${r.agente}: ${resumen} (${via})`, r.campaignId);
  // Lo que el jefe corrige se vuelve memoria del cliente.
  if (respuesta && ['concepto', 'autorizacion'].includes(r.tipo)) {
    addMemory({ campaignId: r.campaignId, texto: `${r.tipo === 'concepto' ? 'Sobre el concepto' : 'Sobre una autorización'} «${r.texto.replace(/^["«]|["»]$/g, '')}», el jefe dijo (${aprobado ? 'aprobando' : 'pidiendo cambios'}): ${respuesta}`, origen: 'comentario del jefe' });
  }
  const camp = db.campaigns.find((c) => c.id === r.campaignId);
  if (camp && r.tipo === 'cuestionario') { camp.respuestas = respuesta; bus.emit('campaign', camp); try { ws.respuestas(camp, respuesta); } catch {} }
  if (camp && r.tipo === 'concepto' && aprobado) { camp.concepto = { titulo: r.texto, detalle: r.detalle }; camp.fase = 'produccion'; bus.emit('campaign', camp); try { ws.concepto(camp); } catch {} }
  bus.emit('request', r);
  requestWaiters.get(id)?.(r);
  requestWaiters.delete(id);
  return r;
}

// ---- Piezas creativas (feed tipo Tinder) ----
const pieceWaiters = new Map();

export function submitPiece({ agente, campaignId, tipo, titulo, descripcion, contenido, version = 1, key = null, motor = null }) {
  const prev = key && db.pieces.find((x) => x.key === key && x.estado !== 'expirada');
  if (prev) {
    if (prev.estado !== 'pendiente') return Promise.resolve(prev);
    return new Promise((resolve) => pieceWaiters.set(prev.id, resolve));
  }
  const p = {
    id: newId('p'), key, agente, campaignId, tipo, titulo, descripcion, contenido, version, motor,
    estado: 'pendiente', creada: Date.now(),
  };
  db.pieces.push(p);
  save();
  log(agente, `Entregó ${tipo}: "${titulo}" — esperando tu swipe`, campaignId);
  bus.emit('piece', p);
  return new Promise((resolve) => pieceWaiters.set(p.id, resolve));
}

export function judgePiece(id, { aprobado, comentario = '', via = 'web' }) {
  const p = db.pieces.find((x) => x.id === id);
  if (!p || p.estado !== 'pendiente') return null;
  Object.assign(p, { estado: aprobado ? 'aprobada' : 'rechazada', comentario, via, juzgada: Date.now() });
  if (aprobado) p.archivo = entregables.guardar(p) || p.archivo;
  save();
  log('jefe', `${aprobado ? '✅ Aprobó' : '❌ Rechazó'} "${p.titulo}"${comentario ? `: ${comentario}` : ''} (${via})`, p.campaignId);
  if (comentario) addMemory({ campaignId: p.campaignId, texto: `En la pieza (${p.tipo}) "${p.titulo}", el jefe ${aprobado ? 'la aprobó y comentó' : 'la rechazó y pidió'}: ${comentario}`, origen: 'feed' });
  bus.emit('piece', p);
  pieceWaiters.get(id)?.(p);
  pieceWaiters.delete(id);
  return p;
}

export function pieceSummary(p) {
  const { contenido, ...rest } = p;
  return rest;
}

// ---- Costo de la API de Claude (aprox., USD por millón de tokens) ----
const PRECIOS = {
  'claude-opus-5-5': [4, 20, 0.2], 'claude-sonnet-5-5': [2, 10, 0.2], 'claude-haiku-5-5': [0.1, 0.5, 0.01],
  'claude-fable-5-1': [10, 50, 0.25],
};

export function addUsage(campaignId, model, usage, agente = null) {
  if (!usage) return 0;
  const [inp, out, cacheRead] = PRECIOS[model] || PRECIOS['claude-opus-5-5'];
  const usd = ((usage.input_tokens || 0) * inp
    + (usage.cache_creation_input_tokens || 0) * inp * 1.25
    + (usage.cache_read_input_tokens || 0) * cacheRead
    + (usage.output_tokens || 0) * out) / 1e6;
  db.usage.push({
    t: Date.now(), c: campaignId, a: agente, m: model, usd,
    i: usage.input_tokens || 0, o: usage.output_tokens || 0,
    cr: usage.cache_read_input_tokens || 0, cw: usage.cache_creation_input_tokens || 0,
  });
  if (db.usage.length > 50000) db.usage.splice(0, db.usage.length - 50000);
  const c = db.campaigns.find((x) => x.id === campaignId);
  if (c) {
    c.costo = (c.costo || 0) + usd;
    bus.emit('campaign', c);
  }
  save();
  bus.emit('usage', usageSummary());
  return usd;
}

const startOfMonth = () => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime(); };
const startOfDay = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const budget = () => Number(process.env.MONTHLY_BUDGET || 0) || null;

export function usageSummary() {
  const m = startOfMonth(), d = startOfDay();
  let mes = 0, hoy = 0;
  for (const u of db.usage) { if (u.t >= m) mes += u.usd; if (u.t >= d) hoy += u.usd; }
  return { mes, hoy, presupuesto: budget() };
}

// Reporte completo para el panel de uso.
export function usageReport() {
  const m = startOfMonth();
  const desde30 = Date.now() - 29 * 86400000;
  const dias = {};
  for (let i = 29; i >= 0; i--) { const k = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10); dias[k] = { dia: k, usd: 0, llamadas: 0 }; }
  const agentes = {}, campanas = {}, modelos = {};
  const tot = { usd: 0, llamadas: 0, entrada: 0, salida: 0, cache: 0 };
  for (const u of db.usage) {
    if (u.t >= desde30) { const k = new Date(u.t).toISOString().slice(0, 10); if (dias[k]) { dias[k].usd += u.usd; dias[k].llamadas++; } }
    if (u.t < m) continue;
    tot.usd += u.usd; tot.llamadas++; tot.entrada += u.i + u.cw; tot.salida += u.o; tot.cache += u.cr;
    const add = (map, key, extra = {}) => { map[key] ||= { ...extra, usd: 0, llamadas: 0, tokens: 0 }; map[key].usd += u.usd; map[key].llamadas++; map[key].tokens += u.i + u.o + u.cr + u.cw; };
    add(agentes, u.a || 'chat', { id: u.a || 'chat' });
    if (u.c) add(campanas, u.c, { id: u.c, cliente: db.campaigns.find((x) => x.id === u.c)?.cliente || '—' });
    add(modelos, u.m, { modelo: u.m });
  }
  const sorted = (o) => Object.values(o).sort((a, b) => b.usd - a.usd);
  const diasMes = (Date.now() - m) / 86400000;
  return {
    ...usageSummary(), total: tot,
    proyeccion: diasMes > 0.5 ? (tot.usd / diasMes) * new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() : null,
    porDia: Object.values(dias), porAgente: sorted(agentes), porCampana: sorted(campanas).slice(0, 15), porModelo: sorted(modelos),
  };
}

// Texto del kit de marca que leen los agentes.
export function brandText(client) {
  if (!client) return '';
  const l = [`Kit de marca de ${client.nombre}:`];
  if (client.rubro) l.push(`- Rubro: ${client.rubro}`);
  if (client.publico) l.push(`- Público: ${client.publico}`);
  if (client.tono) l.push(`- Tono de voz: ${client.tono}`);
  if (client.colores?.length) l.push(`- Colores de marca (úsalos siempre): ${client.colores.join(', ')}`);
  if (client.tipografia) l.push(`- Tipografía preferida: ${client.tipografia} (si no está disponible, usa la fuente del sistema más parecida)`);
  if (client.notas) l.push(`- Reglas y notas: ${client.notas}`);
  if (client.objetivo) l.push(`- Objetivo principal: ${client.objetivo}`);
  if (client.competencia) l.push(`- Competencia y marcas que admira: ${client.competencia}`);
  const redes = Object.entries(client.redes || {}).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
  if (redes.length) l.push(`- Redes: ${redes.join(' · ')}`);
  if (client.logo) l.push('- Logo: SÍ hay logo oficial. Para colocarlo usa exactamente el marcador {{LOGO}} como dirección de la imagen: en SVG <image href="{{LOGO}}" x=".." y=".." width=".." height=".."/> y en HTML <img src="{{LOGO}}">. El sistema lo reemplaza por el logo real. Nunca dibujes ni inventes un logo.');
  else l.push('- Logo: no hay logo cargado; escribe el nombre de la marca con buena tipografía.');
  return l.join('\n');
}

// ---- Fase de la campaña (para el panel de pendientes) ----
export function setPhase(campaignId, fase) {
  const c = db.campaigns.find((x) => x.id === campaignId);
  if (!c || c.fase === fase) return;
  c.fase = fase;
  save();
  bus.emit('campaign', c);
}

// ---- Memoria: lo que la agencia aprende de cada cliente ----
export function addMemory({ clientId, campaignId, texto, origen = 'agente', agente = null }) {
  if (arguments[0].key && db.memories.some((m) => m.key === arguments[0].key)) return null;
  const cid = clientId !== undefined ? clientId : (db.campaigns.find((c) => c.id === campaignId)?.clientId ?? null);
  const m = { id: newId('m'), key: arguments[0].key || null, clientId: cid || null, campaignId: campaignId || null, texto: String(texto).trim().slice(0, 800), origen, agente, creada: Date.now() };
  if (!m.texto) return null;
  db.memories.push(m);
  if (db.memories.length > 3000) db.memories.splice(0, db.memories.length - 3000);
  save();
  bus.emit('memory', m);
  return m;
}

const fecha = (t) => new Date(t).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });

// Memoria + historial que se le da a cada agente al empezar una tarea.
export function memoryText(clientId, campaignId) {
  const out = [];
  const delCliente = clientId ? db.memories.filter((m) => m.clientId === clientId).slice(-30) : [];
  const generales = db.memories.filter((m) => !m.clientId).slice(-15);
  if (delCliente.length) out.push('MEMORIA DE ESTE CLIENTE (preferencias y aprendizajes; respétalas):\n' + delCliente.map((m) => `- ${m.texto}`).join('\n'));
  if (generales.length) out.push('MEMORIA DE LA AGENCIA (reglas generales del jefe):\n' + generales.map((m) => `- ${m.texto}`).join('\n'));
  if (clientId) {
    const previas = db.campaigns.filter((c) => c.clientId === clientId && c.id !== campaignId).slice(-5);
    if (previas.length) {
      out.push('CAMPAÑAS ANTERIORES DE ESTE CLIENTE:\n' + previas.map((c) => {
        const ok = db.pieces.filter((p) => p.campaignId === c.id && p.estado === 'aprobada').map((p) => `${p.tipo} "${p.titulo}"`);
        return `- ${fecha(c.creada)}: ${c.brief.slice(0, 160)}${c.concepto ? ` · Concepto aprobado: ${c.concepto.titulo}` : ''}${ok.length ? ` · Aprobado: ${ok.join(', ')}` : ''}`;
      }).join('\n'));
    }
  }
  return out.join('\n\n');
}

// ---- Juntas creativas: todo el equipo aporta ideas en la mesa de juntas ----
export function startMeeting({ campaignId, tema, contexto = '', convoca = 'director', key = null }) {
  let m = key && db.meetings.find((x) => x.key === key);
  if (!m) {
    const n = db.meetings.filter((x) => x.campaignId === campaignId).length + 1;
    m = { id: newId('mt'), key, campaignId, numero: n, tema: String(tema).slice(0, 300), contexto: String(contexto).slice(0, 3000), convoca, aportes: [], estado: 'en_curso', creada: Date.now() };
    db.meetings.push(m);
    log(convoca, `🗣️ Convoca la junta creativa #${n}: ${m.tema}`, campaignId);
  }
  m.estado = 'en_curso';
  save();
  bus.emit('meeting', m);
  return m;
}

export function addAporte(m, agente, texto) {
  m.aportes = m.aportes.filter((a) => a.agente !== agente);
  m.aportes.push({ agente, texto: String(texto).trim().slice(0, 1500), t: Date.now() });
  try { ws.junta(agente, m, String(texto).trim().slice(0, 1500)); } catch {}
  save();
  log(agente, `💬 En la junta: ${texto}`, m.campaignId);
  bus.emit('meeting', m);
}

export function endMeeting(m) {
  m.estado = 'terminada';
  m.terminada = Date.now();
  save();
  bus.emit('meeting', m);
}

export const meetingTranscript = (m, nombre) => m.aportes.map((a) => `${nombre(a.agente)}: ${a.texto}`).join('\n\n');

// El "centro" de la oficina: estado de cada agente, solicitudes al jefe,
// piezas para el feed y bitácora. Todo cambio se emite como evento para
// que la interfaz (WebSocket) y Telegram se enteren al instante.
import { EventEmitter } from 'node:events';
import { db, save, newId } from './store.js';
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

export function askBoss({ tipo, agente, campaignId, texto, opciones = [], detalle = '' }) {
  const r = {
    id: newId('r'), tipo, agente, campaignId, texto, opciones, detalle,
    estado: 'pendiente', creada: Date.now(),
  };
  db.requests.push(r);
  save();
  log(agente, tipo === 'autorizacion' ? `Pide autorización: ${texto}` : `Pregunta: ${texto}`, campaignId);
  bus.emit('request', r);
  return new Promise((resolve) => requestWaiters.set(r.id, resolve));
}

export function answerRequest(id, { respuesta = '', aprobado = null, via = 'web' }) {
  const r = db.requests.find((x) => x.id === id);
  if (!r || r.estado !== 'pendiente') return null;
  Object.assign(r, { estado: 'respondida', respuesta, aprobado, via, respondida: Date.now() });
  save();
  const resumen = r.tipo === 'autorizacion'
    ? (aprobado ? 'AUTORIZADO' : 'NO AUTORIZADO') + (respuesta ? ` — ${respuesta}` : '')
    : respuesta;
  log('jefe', `Respondió a ${r.agente}: ${resumen} (${via})`, r.campaignId);
  bus.emit('request', r);
  requestWaiters.get(id)?.(r);
  requestWaiters.delete(id);
  return r;
}

// ---- Piezas creativas (feed tipo Tinder) ----
const pieceWaiters = new Map();

export function submitPiece({ agente, campaignId, tipo, titulo, descripcion, contenido, version = 1 }) {
  const p = {
    id: newId('p'), agente, campaignId, tipo, titulo, descripcion, contenido, version,
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
  save();
  log('jefe', `${aprobado ? '✅ Aprobó' : '❌ Rechazó'} "${p.titulo}"${comentario ? `: ${comentario}` : ''} (${via})`, p.campaignId);
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

export function addUsage(campaignId, model, usage) {
  if (!usage) return 0;
  const [inp, out, cacheRead] = PRECIOS[model] || PRECIOS['claude-opus-5-5'];
  const usd = ((usage.input_tokens || 0) * inp
    + (usage.cache_creation_input_tokens || 0) * inp * 1.25
    + (usage.cache_read_input_tokens || 0) * cacheRead
    + (usage.output_tokens || 0) * out) / 1e6;
  const c = db.campaigns.find((x) => x.id === campaignId);
  if (c) {
    c.costo = (c.costo || 0) + usd;
    save();
    bus.emit('campaign', c);
  }
  return usd;
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
  if (client.logo) l.push('- Logo: SÍ hay logo oficial. Para colocarlo usa exactamente el marcador {{LOGO}} como dirección de la imagen: en SVG <image href="{{LOGO}}" x=".." y=".." width=".." height=".."/> y en HTML <img src="{{LOGO}}">. El sistema lo reemplaza por el logo real. Nunca dibujes ni inventes un logo.');
  else l.push('- Logo: no hay logo cargado; escribe el nombre de la marca con buena tipografía.');
  return l.join('\n');
}

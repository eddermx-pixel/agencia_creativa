// Servidor de la agencia: API + WebSocket en tiempo real + archivos de la interfaz.
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import { db, save, newId } from './store.js';
import { publicRoster, byId } from './roster.js';
import { bus, agentState, answerRequest, judgePiece, log, pieceSummary, usageSummary, usageReport, addMemory } from './hub.js';
import { startTelegram } from './telegram.js';
import { makeZip } from './zip.js';

// Carga .env si existe (sin dependencias extra).
const here = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(here, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const DEMO = process.env.DEMO === '1' || !(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const runtime = await import(DEMO ? './runtime-demo.js' : './runtime-claude.js');
const KEY = process.env.ACCESS_KEY || '';
const PORT = Number(process.env.PORT || 3000);

const app = express();
app.use(express.json({ limit: '2mb' }));

// Acceso protegido con una clave simple (ACCESS_KEY) si está configurada.
function authorized(req) {
  if (!KEY) return true;
  const fromCookie = /(?:^|;\s*)agencia_key=([^;]+)/.exec(req.headers.cookie || '')?.[1];
  const url = new URL(req.url, 'http://x');
  return [req.headers['x-access-key'], url.searchParams.get('key'), fromCookie && decodeURIComponent(fromCookie)].includes(KEY);
}
const keyCookie = () => `agencia_key=${encodeURIComponent(KEY)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT ? '; Secure' : ''}`;

// Para que el hosting (Railway) sepa que la app está viva. No requiere clave.
app.get('/healthz', (req, res) => res.json({ ok: true }));

app.post('/login', express.urlencoded({ extended: false }), (req, res) => {
  if (KEY && req.body?.key === KEY) {
    res.setHeader('Set-Cookie', keyCookie());
    return res.redirect(303, '/');
  }
  res.redirect(303, '/?error=1');
});

app.use((req, res, next) => {
  const q = new URL(req.url, 'http://x').searchParams.get('key');
  if (KEY && q === KEY) res.setHeader('Set-Cookie', keyCookie());
  if (authorized(req) || req.path === '/api/agency/logo') return next();
  if (req.method === 'GET' && !req.path.startsWith('/api/')) return res.status(401).sendFile(path.join(here, 'login.html'));
  res.status(401).json({ error: 'Acceso restringido' });
});

app.use(express.static(path.join(here, '..', 'public')));

function snapshot() {
  return {
    demo: DEMO,
    modelo: DEMO ? null : (process.env.CLAUDE_MODEL || 'claude-opus-5-5'),
    agencia: { nombre: db.agency.nombre || '', tieneLogo: !!db.agency.logo, actualizado: db.agency.actualizado || 0 },
    uso: usageSummary(),
    roster: publicRoster(),
    meetings: db.meetings.slice(-30),
    clients: db.clients.map(clientSummary),
    agents: Object.values(agentState),
    campaigns: db.campaigns.slice(-20).map((c) => ({ ...c, activa: runtime.isRunning(c.id) })),
    requests: db.requests.filter((r) => r.estado === 'pendiente'),
    pieces: db.pieces.slice(-60).map(pieceSummary),
    log: db.log.slice(-120),
  };
}

app.get('/api/state', (req, res) => res.json(snapshot()));
app.get('/api/usage', (req, res) => res.json(usageReport()));

// Currículum + estadísticas reales de cada agente.
app.get('/api/team', (req, res) => {
  const uso = usageReport().porAgente;
  res.json(publicRoster().map((a) => {
    const piezas = db.pieces.filter((p) => p.agente === a.id);
    const juzgadas = piezas.filter((p) => ['aprobada', 'rechazada'].includes(p.estado));
    const campanas = new Set([...db.jobs.filter((j) => j.agentId === a.id).map((j) => j.campaignId), ...piezas.map((p) => p.campaignId), ...db.meetings.filter((m) => m.aportes.some((x) => x.agente === a.id)).map((m) => m.campaignId)]);
    return {
      ...a,
      stats: {
        campanas: campanas.size,
        entregadas: piezas.length,
        aprobadas: piezas.filter((p) => p.estado === 'aprobada').length,
        aprobacion: juzgadas.length ? Math.round((piezas.filter((p) => p.estado === 'aprobada').length / juzgadas.length) * 100) : null,
        aportes: db.meetings.reduce((n, m) => n + m.aportes.filter((x) => x.agente === a.id).length, 0),
        memorias: db.memories.filter((m) => m.agente === a.id).length,
        costoMes: uso.find((u) => u.id === a.id)?.usd || 0,
      },
    };
  }));
});

// ---- Clientes (kit de marca) ----
const clientSummary = ({ logo, ...c }) => ({ ...c, tieneLogo: !!logo });
const CLIENT_FIELDS = ['nombre', 'rubro', 'publico', 'tono', 'tipografia', 'notas'];

function cleanClient(body, prev = {}) {
  const c = { ...prev };
  for (const f of CLIENT_FIELDS) if (f in body) c[f] = String(body[f] || '').trim().slice(0, 1500);
  if (Array.isArray(body.colores)) c.colores = body.colores.filter((x) => /^#[0-9a-f]{6}$/i.test(x)).slice(0, 5);
  if (body.logo === null) delete c.logo;
  else if (typeof body.logo === 'string' && /^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(body.logo) && body.logo.length < 700_000) c.logo = body.logo;
  c.actualizado = Date.now();
  return c;
}

app.post('/api/clients', (req, res) => {
  const c = cleanClient(req.body || {}, { id: newId('cl'), creado: Date.now() });
  if (!c.nombre) return res.status(400).json({ error: 'Falta el nombre del cliente' });
  db.clients.push(c);
  save();
  bus.emit('client', clientSummary(c));
  res.json(clientSummary(c));
});

app.post('/api/clients/:id', (req, res) => {
  const i = db.clients.findIndex((x) => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'No existe' });
  db.clients[i] = cleanClient(req.body || {}, db.clients[i]);
  save();
  bus.emit('client', clientSummary(db.clients[i]));
  res.json(clientSummary(db.clients[i]));
});

// ---- Mi agencia (nombre y logo para la interfaz) ----
app.post('/api/agency', (req, res) => {
  const b = req.body || {};
  if ('nombre' in b) db.agency.nombre = String(b.nombre || '').trim().slice(0, 60);
  if (b.logo === null) delete db.agency.logo;
  else if (typeof b.logo === 'string' && /^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(b.logo) && b.logo.length < 700_000) db.agency.logo = b.logo;
  db.agency.actualizado = Date.now();
  save();
  const pub = { nombre: db.agency.nombre || '', tieneLogo: !!db.agency.logo, actualizado: db.agency.actualizado };
  bus.emit('agency', pub);
  res.json(pub);
});

app.get('/api/agency/logo', (req, res) => {
  const m = db.agency.logo && /^data:([^;]+);base64,(.*)$/.exec(db.agency.logo);
  if (!m) return res.status(404).end();
  res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
  res.type(m[1]).send(Buffer.from(m[2], 'base64'));
});

app.get('/api/clients/:id/logo', (req, res) => {
  const c = db.clients.find((x) => x.id === req.params.id);
  const m = c?.logo && /^data:([^;]+);base64,(.*)$/.exec(c.logo);
  if (!m) return res.status(404).end();
  res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
  res.type(m[1]).send(Buffer.from(m[2], 'base64'));
});

app.post('/api/campaigns', (req, res) => {
  const { clientId, brief } = req.body || {};
  let cl = db.clients.find((x) => x.id === clientId);
  // Cliente escrito a mano: se busca por nombre o se le crea su ficha, para que
  // su memoria y su historial queden separados de los demás clientes.
  const nombre = String(req.body?.cliente || '').trim();
  if (!cl && nombre) {
    cl = db.clients.find((x) => x.nombre.toLowerCase() === nombre.toLowerCase());
    if (!cl) {
      cl = { id: newId('cl'), nombre: nombre.slice(0, 120), colores: [], creado: Date.now(), actualizado: Date.now() };
      db.clients.push(cl);
      bus.emit('client', clientSummary(cl));
    }
  }
  const cliente = cl?.nombre || req.body?.cliente;
  if (!cliente?.trim() || !brief?.trim()) return res.status(400).json({ error: 'Falta cliente o brief' });
  const c = { id: newId('c'), clientId: cl?.id || null, cliente: cliente.trim(), brief: brief.trim(), estado: 'en_curso', creada: Date.now(), costo: 0 };
  db.campaigns.push(c);
  save();
  log('jefe', `Nueva campaña: ${c.cliente}`, c.id);
  bus.emit('campaign', c);
  track(c, runtime.runCampaign(c));
  res.json(c);
});

// Si respondes algo de una campaña que se quedó sin agentes trabajando (por un
// reinicio del servidor), la campaña se reanuda sola desde su último paso.
function wakeIfStuck(campaignId) {
  const c = db.campaigns.find((x) => x.id === campaignId);
  if (!c || c.estado !== 'en_curso' || runtime.isRunning(c.id) || DEMO) return;
  log('director', `🔄 Reanudando la campaña de ${c.cliente} con tu respuesta.`, c.id);
  track(c, runtime.retryCampaign(c));
}

// Sigue una campaña hasta que termina (o falla) y actualiza su estado.
function track(c, promise) {
  promise
    .then((resumen) => { c.estado = 'terminada'; c.fase = 'terminada'; c.resumen = resumen; c.terminada = Date.now(); log('director', `🏁 Campaña de ${c.cliente} terminada.`, c.id); })
    .catch((e) => { c.estado = 'error'; c.resumen = e.message; })
    .finally(() => { save(); bus.emit('campaign', c); });
}

app.post('/api/campaigns/:id/retry', (req, res) => {
  const c = db.campaigns.find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'No existe' });
  if (c.estado === 'en_curso' && runtime.isRunning(c.id)) return res.status(409).json({ error: 'La campaña ya está trabajando' });
  c.estado = 'en_curso'; c.resumen = '';
  save(); bus.emit('campaign', c);
  log('jefe', `Reintentar campaña: ${c.cliente}`, c.id);
  track(c, runtime.retryCampaign(c));
  res.json(c);
});

app.post('/api/requests/:id', (req, res) => {
  const { respuesta = '', aprobado = null, respuestas = null } = req.body || {};
  const r = answerRequest(req.params.id, { respuesta: String(respuesta).slice(0, 3000), aprobado, respuestas, via: 'web' });
  if (r) wakeIfStuck(r.campaignId);
  r ? res.json(r) : res.status(409).json({ error: 'Ya estaba resuelta' });
});

app.get('/api/pieces', (req, res) => {
  const estado = req.query.estado;
  res.json(db.pieces.filter((p) => !estado || p.estado === estado).slice(-100).map(pieceSummary));
});

// ---- Archivo: todas las piezas y descargas ----
const slug = (s) => String(s || 'pieza').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60) || 'pieza';
const EXT = { arte: 'svg', video: 'html', texto: 'txt' };
function pieceBody(p) {
  if (p.tipo === 'texto') return p.contenido;
  const camp = db.campaigns.find((x) => x.id === p.campaignId);
  const logo = db.clients.find((x) => x.id === camp?.clientId)?.logo || '';
  return p.contenido.replaceAll('{{LOGO}}', logo);
}
const fileName = (p) => { const b = slug(p.titulo); return `${/-v\d+$/.test(b) ? b : `${b}-v${p.version || 1}`}.${EXT[p.tipo] || 'txt'}`; };

app.get('/api/archive', (req, res) => {
  res.json({
    campaigns: db.campaigns.map((c) => ({ id: c.id, cliente: c.cliente, clientId: c.clientId, brief: c.brief, estado: c.estado, fase: c.fase, creada: c.creada, concepto: c.concepto || null, respuestas: c.respuestas || '', costo: c.costo || 0 })),
    pieces: db.pieces.map(pieceSummary),
  });
});

app.get('/api/pieces/:id/download', (req, res) => {
  const p = db.pieces.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).end();
  res.setHeader('Content-Disposition', `attachment; filename="${fileName(p)}"`);
  res.type({ arte: 'image/svg+xml', video: 'text/html', texto: 'text/plain; charset=utf-8' }[p.tipo] || 'text/plain').send(pieceBody(p));
});

// Campaña completa en .zip: piezas aprobadas (o todas con ?todas=1) + resumen.
app.get('/api/campaigns/:id/zip', (req, res) => {
  const c = db.campaigns.find((x) => x.id === req.params.id);
  if (!c) return res.status(404).end();
  const all = db.pieces.filter((p) => p.campaignId === c.id);
  const sel = req.query.todas ? all : all.filter((p) => p.estado === 'aprobada');
  const fecha = new Date(c.creada).toISOString().slice(0, 10);
  const resumen = [
    `CAMPAÑA: ${c.cliente}`, `Fecha: ${fecha}`, `Estado: ${c.estado}`, '', 'BRIEF:', c.brief, '',
    c.respuestas ? `RESPUESTAS DEL CUESTIONARIO:\n${c.respuestas}\n` : '',
    c.concepto ? `CONCEPTO APROBADO: ${c.concepto.titulo}\n${c.concepto.detalle}\n` : '',
    'PIEZAS:', ...all.map((p) => `- [${p.estado}] ${p.tipo} "${p.titulo}" v${p.version || 1}${p.comentario ? ` — comentario: ${p.comentario}` : ''}`),
  ].join('\n');
  const files = [{ name: 'resumen.txt', data: resumen }, ...sel.map((p) => ({ name: `${p.estado === 'aprobada' ? 'aprobadas' : p.estado}/${fileName(p)}`, data: pieceBody(p) }))];
  res.setHeader('Content-Disposition', `attachment; filename="${slug(c.cliente)}-${fecha}.zip"`);
  res.type('application/zip').send(makeZip(files));
});

// ---- Memoria ----
app.get('/api/memories', (req, res) => {
  res.json([...db.memories].reverse().map(({ key, ...m }) => m));
});
app.post('/api/memories', (req, res) => {
  const { clientId = null, texto = '' } = req.body || {};
  if (!String(texto).trim()) return res.status(400).json({ error: 'Escribe algo para recordar' });
  if (clientId && !db.clients.some((c) => c.id === clientId)) return res.status(400).json({ error: 'Cliente inexistente' });
  res.json(addMemory({ clientId, texto, origen: 'jefe' }));
});
app.post('/api/memories/:id', (req, res) => {
  const m = db.memories.find((x) => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'No existe' });
  if ('texto' in (req.body || {})) m.texto = String(req.body.texto).trim().slice(0, 800);
  if (req.body?.borrar) db.memories.splice(db.memories.indexOf(m), 1);
  save();
  bus.emit('memory', { ...m, borrada: !!req.body?.borrar });
  res.json({ ok: true });
});

// Las piezas se sirven en una "caja de arena": su código no puede tocar la app.
app.get('/api/pieces/:id/render', (req, res) => {
  const p = db.pieces.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).end();
  res.setHeader('Content-Security-Policy', "sandbox allow-scripts; default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:");
  // El marcador {{LOGO}} se reemplaza por el logo real del cliente.
  const camp = db.campaigns.find((x) => x.id === p.campaignId);
  const logo = db.clients.find((x) => x.id === camp?.clientId)?.logo || '';
  const body = p.tipo === 'texto' ? p.contenido : p.contenido.replaceAll('{{LOGO}}', logo);
  if (p.tipo === 'arte') res.type('image/svg+xml').send(body);
  else if (p.tipo === 'video') res.type('text/html').send(body);
  else res.type('text/plain; charset=utf-8').send(p.contenido);
});

app.post('/api/pieces/:id', (req, res) => {
  const { aprobado, comentario = '' } = req.body || {};
  const p = judgePiece(req.params.id, { aprobado: !!aprobado, comentario, via: 'web' });
  if (p) wakeIfStuck(p.campaignId);
  p ? res.json(pieceSummary(p)) : res.status(409).json({ error: 'Ya estaba juzgada' });
});

app.post('/api/agents/:id/chat', async (req, res) => {
  const id = req.params.id;
  if (!byId[id]) return res.status(404).end();
  const mensaje = String(req.body?.mensaje || '').slice(0, 2000);
  log('jefe', `A ${byId[id].nombre}: ${mensaje}`);
  try {
    const contexto = db.log.filter((l) => l.agente === id).slice(-15).map((l) => `- ${l.texto}`).join('\n') || '(nada todavía)';
    const respuesta = await runtime.chatWithAgent(id, mensaje, contexto);
    log(id, respuesta);
    res.json({ respuesta });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws, req) => {
  if (!authorized(req)) return ws.close(4001, 'unauthorized');
  ws.send(JSON.stringify({ type: 'snapshot', data: snapshot() }));
});
const broadcast = (type, data) => {
  const msg = JSON.stringify({ type, data });
  for (const c of wss.clients) if (c.readyState === 1) c.send(msg);
};
bus.on('agent', (a) => broadcast('agent', a));
bus.on('log', (l) => broadcast('log', l));
bus.on('request', (r) => broadcast('request', r));
bus.on('piece', (p) => broadcast('piece', pieceSummary(p)));
bus.on('campaign', (c) => broadcast('campaign', { ...c, activa: runtime.isRunning(c.id) }));
bus.on('wake', (cid) => wakeIfStuck(cid));
bus.on('client', (c) => broadcast('client', c));
bus.on('usage', (u) => broadcast('usage', u));
bus.on('agency', (a) => broadcast('agency', a));
bus.on('memory', (m) => broadcast('memory', { id: m.id, borrada: !!m.borrada }));
bus.on('meeting', (m) => broadcast('meeting', m));

startTelegram();
// Retoma lo que estaba en curso antes del reinicio.
for (const { campaign, promise } of runtime.boot()) track(campaign, promise);
server.listen(PORT, () => {
  console.log(`\n🏢 Agencia IA en http://localhost:${PORT}${KEY ? `/?key=${KEY}` : ''}`);
  console.log(DEMO ? '🎭 MODO DEMO (sin API key de Claude: los agentes siguen un guion)' : `🤖 Agentes reales con ${process.env.CLAUDE_MODEL || 'claude-opus-5-5'}`);
});

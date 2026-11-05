// Servidor de la agencia: API + WebSocket en tiempo real + archivos de la interfaz.
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import { db, save, newId } from './store.js';
import { publicRoster, byId } from './roster.js';
import { bus, agentState, answerRequest, judgePiece, log, pieceSummary } from './hub.js';
import { startTelegram } from './telegram.js';

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
app.use((req, res, next) => {
  const q = new URL(req.url, 'http://x').searchParams.get('key');
  if (KEY && q === KEY) res.setHeader('Set-Cookie', `agencia_key=${encodeURIComponent(KEY)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`);
  if (authorized(req)) return next();
  res.status(401).send('Acceso restringido: abre el enlace con ?key=TU_CLAVE');
});

app.use(express.static(path.join(here, '..', 'public')));

function snapshot() {
  return {
    demo: DEMO,
    roster: publicRoster(),
    agents: Object.values(agentState),
    campaigns: db.campaigns.slice(-20),
    requests: db.requests.filter((r) => r.estado === 'pendiente'),
    pieces: db.pieces.slice(-60).map(pieceSummary),
    log: db.log.slice(-120),
  };
}

app.get('/api/state', (req, res) => res.json(snapshot()));

app.post('/api/campaigns', (req, res) => {
  const { cliente, brief } = req.body || {};
  if (!cliente?.trim() || !brief?.trim()) return res.status(400).json({ error: 'Falta cliente o brief' });
  const c = { id: newId('c'), cliente: cliente.trim(), brief: brief.trim(), estado: 'en_curso', creada: Date.now() };
  db.campaigns.push(c);
  save();
  log('jefe', `Nueva campaña: ${c.cliente}`, c.id);
  bus.emit('campaign', c);
  runtime.runCampaign(c)
    .then((resumen) => { c.estado = 'terminada'; c.resumen = resumen; })
    .catch((e) => { c.estado = 'error'; c.resumen = e.message; })
    .finally(() => { save(); bus.emit('campaign', c); });
  res.json(c);
});

app.post('/api/requests/:id', (req, res) => {
  const { respuesta = '', aprobado = null } = req.body || {};
  const r = answerRequest(req.params.id, { respuesta, aprobado, via: 'web' });
  r ? res.json(r) : res.status(409).json({ error: 'Ya estaba resuelta' });
});

app.get('/api/pieces', (req, res) => {
  const estado = req.query.estado;
  res.json(db.pieces.filter((p) => !estado || p.estado === estado).slice(-100).map(pieceSummary));
});

// Las piezas se sirven en una "caja de arena": su código no puede tocar la app.
app.get('/api/pieces/:id/render', (req, res) => {
  const p = db.pieces.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).end();
  res.setHeader('Content-Security-Policy', "sandbox allow-scripts; default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:");
  if (p.tipo === 'arte') res.type('image/svg+xml').send(p.contenido);
  else if (p.tipo === 'video') res.type('text/html').send(p.contenido);
  else res.type('text/plain; charset=utf-8').send(p.contenido);
});

app.post('/api/pieces/:id', (req, res) => {
  const { aprobado, comentario = '' } = req.body || {};
  const p = judgePiece(req.params.id, { aprobado: !!aprobado, comentario, via: 'web' });
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
bus.on('campaign', (c) => broadcast('campaign', c));

startTelegram();
server.listen(PORT, () => {
  console.log(`\n🏢 Agencia IA en http://localhost:${PORT}${KEY ? `/?key=${KEY}` : ''}`);
  console.log(DEMO ? '🎭 MODO DEMO (sin API key de Claude: los agentes siguen un guion)' : `🤖 Agentes reales con ${process.env.CLAUDE_MODEL || 'claude-opus-5-5'}`);
});

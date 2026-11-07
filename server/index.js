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
import * as files from './files.js';
import { initCursos, proponer, cursosDe } from './cursos.js';
import * as ws from './workspace.js';
import * as entregables from './entregables.js';
import QRCode from 'qrcode';
import * as planeacion from './planeacion.js';
import * as costos from './costos.js';
import * as voz from './voz.js';
import * as render from './render.js';
import * as musica from './musica.js';
import crypto from 'node:crypto';
import { ESTILOS, estiloById, demoSpec, resolveBroll, proxyBroll, brollDisponible, sugerirEstilos, diagnosticoBroll, pruebaChatbot } from './video.js';

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
  if (authorized(req) || req.path === '/api/agency/logo' || req.path === '/alta.html' || req.path.startsWith('/pub/') || req.path === '/subir.html' || req.path.startsWith('/api/alta/')) return next();
  if (req.method === 'GET' && !req.path.startsWith('/api/')) return res.status(401).sendFile(path.join(here, 'login.html'));
  res.status(401).json({ error: 'Acceso restringido' });
});

// Enlaces públicos firmados para que GoHighLevel pueda descargar un archivo aprobado (sin abrir el resto)
db.agency.pubSecret ||= crypto.randomBytes(24).toString('hex'); save();
const firma = (cid, ruta) => crypto.createHmac('sha256', db.agency.pubSecret).update(`${cid}|${ruta}`).digest('hex').slice(0, 40);
planeacion.setUrlPublica((cid, ruta, base) => `${base}/pub/${cid}/${firma(cid, ruta)}/${encodeURIComponent(path.basename(ruta))}?p=${encodeURIComponent(ruta)}`);
app.get('/pub/:cid/:sig/:nombre', (req, res) => {
  const ruta = String(req.query.p || '');
  if (req.params.sig !== firma(req.params.cid, ruta) || !ruta.startsWith(`${files.FINAL}/`)) return res.status(403).end();
  try { const { full } = files.safePath(req.params.cid, ruta); res.sendFile(full); } catch { res.status(404).end(); }
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
app.post('/api/team/:id/curso', (req, res) => { try { res.json(proponer(req.params.id, req.body?.tema ? String(req.body.tema).slice(0, 120) : null)); } catch (e) { res.status(400).json({ error: e.message }); } });

// Currículum + estadísticas reales de cada agente.
app.get('/api/team', (req, res) => {
  const uso = usageReport().porAgente;
  res.json(publicRoster().map((a) => {
    const piezas = db.pieces.filter((p) => p.agente === a.id);
    const juzgadas = piezas.filter((p) => ['aprobada', 'rechazada'].includes(p.estado));
    const campanas = new Set([...db.jobs.filter((j) => j.agentId === a.id).map((j) => j.campaignId), ...piezas.map((p) => p.campaignId), ...db.meetings.filter((m) => m.aportes.some((x) => x.agente === a.id)).map((m) => m.campaignId)]);
    return {
      ...a,
      cursos: cursosDe(a.id).slice(-8).reverse(),
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
const CLIENT_FIELDS = ['nombre', 'rubro', 'publico', 'tono', 'tipografia', 'notas', 'objetivo', 'competencia', 'metas', 'ads', 'ghlLocationId', 'ghlUserId', 'cobroMensual'];

function cleanClient(body, prev = {}) {
  const c = { ...prev };
  for (const f of CLIENT_FIELDS) if (f in body) c[f] = String(body[f] || '').trim().slice(0, 1500);
  if (Array.isArray(body.colores)) c.colores = body.colores.filter((x) => /^#[0-9a-f]{6}$/i.test(x)).slice(0, 5);
  if (Array.isArray(body.ghlCuentas)) c.ghlCuentas = body.ghlCuentas.map((x) => String(x).slice(0, 80)).slice(0, 20);
  if (typeof body.ghlAuto === 'boolean') c.ghlAuto = body.ghlAuto;
  if (body.videoPrefs && typeof body.videoPrefs === 'object') {
    const v = body.videoPrefs; const o = {};
    if ([1, 2, 3].includes(+v.nivel)) o.nivel = +v.nivel;
    if (['natural', 'cine', 'calido', 'frio', 'neon', 'vhs', 'bn', 'pastel'].includes(v.look)) o.look = v.look;
    if (['pop', 'energia', 'lofi', 'epica', 'urbano', 'suave', 'ninguna'].includes(v.musica)) o.musica = v.musica;
    if (['palabra', 'bloque', 'ninguno'].includes(v.subtitulos)) o.subtitulos = v.subtitulos;
    if (['impacto', 'caja', 'neon', 'contorno'].includes(v.estiloTexto)) o.estiloTexto = v.estiloTexto;
    if (typeof v.sensacion === 'string') o.sensacion = v.sensacion.slice(0, 40);
    if (typeof v.emojis === 'boolean') o.emojis = v.emojis;
    if (typeof v.sfx === 'boolean') o.sfx = v.sfx;
    c.videoPrefs = o;
  }
  for (const k of ['redes', 'contacto']) if (body[k] && typeof body[k] === 'object') c[k] = Object.fromEntries(Object.entries(body[k]).slice(0, 8).map(([a, v]) => [String(a).slice(0, 20), String(v || '').trim().slice(0, 200)]));
  if (Array.isArray(body.estilosVideo)) c.estilosVideo = body.estilosVideo.filter((x) => estiloById[x]).slice(0, 6);
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

// ---- Archivos de cada cliente (carpetas ordenadas) ----
const getClient = (req, res) => { const c = db.clients.find((x) => x.id === req.params.id); if (!c) res.status(404).json({ error: 'Cliente inexistente' }); return c; };
const filesChanged = (clientId) => bus.emit('files', { clientId });
app.get('/api/clients/:id/files', (req, res) => { if (getClient(req, res)) res.json({ carpetas: files.listar(req.params.id), max: files.MAX_BYTES }); });
app.put('/api/clients/:id/files', async (req, res) => {
  if (!getClient(req, res)) return;
  try {
    const r = await files.recibir(req, req.params.id, String(req.query.carpeta || ''), String(req.query.sub || ''), String(req.query.nombre || ''));
    log('jefe', `📁 Subió ${r.ruta}`); filesChanged(req.params.id); res.json(r);
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/clients/:id/files/raw', (req, res) => { try { files.enviar(res, req.params.id, String(req.query.path || '')); } catch (e) { res.status(400).json({ error: e.message }); } });
app.post('/api/clients/:id/folders', (req, res) => {
  if (!getClient(req, res)) return;
  try { const ruta = files.crearSubcarpeta(req.params.id, req.body?.carpeta, req.body?.nombre); filesChanged(req.params.id); res.json({ ruta }); } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/clients/:id/files/move', (req, res) => {
  if (!getClient(req, res)) return;
  try { const ruta = files.mover(req.params.id, req.body?.ruta, req.body?.destino); filesChanged(req.params.id); res.json({ ruta }); } catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/clients/:id/files', (req, res) => {
  if (!getClient(req, res)) return;
  try { files.borrar(req.params.id, String(req.query.path || '')); filesChanged(req.params.id); res.json({ ok: true }); } catch (e) { res.status(400).json({ error: e.message }); }
});

// ---- Alta de clientes nuevos por QR (formulario público con invitación) ----
const baseUrl = (req) => (process.env.PUBLIC_URL || `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers.host}`).replace(/\/$/, '');
app.post('/api/invites', async (req, res) => {
  const inv = { token: crypto.randomBytes(12).toString('base64url'), creado: Date.now(), expira: Date.now() + 30 * 86400000, clientId: null, estado: 'abierta', nota: String(req.body?.nota || '').slice(0, 80) };
  db.invites.push(inv); save();
  const url = `${baseUrl(req)}/alta.html?t=${inv.token}`;
  res.json({ ...inv, url, svg: await QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#14141f', light: '#ffffff' } }) });
});
// Enlace/QR para que un cliente que ya existe suba fotos y material (sin cuestionario)
app.post('/api/clients/:id/upload-link', async (req, res) => {
  const c = db.clients.find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Cliente inexistente' });
  let inv = db.invites.find((i) => i.clientId === c.id && i.tipo === 'subida' && i.expira > Date.now() + 86400000);
  if (!inv) { inv = { token: crypto.randomBytes(12).toString('base64url'), creado: Date.now(), expira: Date.now() + 90 * 86400000, clientId: c.id, estado: 'abierta', tipo: 'subida', nota: '' }; db.invites.push(inv); save(); }
  const url = `${baseUrl(req)}/subir.html?t=${inv.token}`;
  res.json({ url, svg: await QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#14141f', light: '#ffffff' } }) });
});
app.get('/api/invites', async (req, res) => {
  res.json(await Promise.all(db.invites.slice(-15).reverse().map(async (i) => ({ ...i, url: `${baseUrl(req)}/alta.html?t=${i.token}`, cliente: db.clients.find((c) => c.id === i.clientId)?.nombre || null }))));
});
const invite = (req, res) => {
  const i = db.invites.find((x) => x.token === req.params.t);
  if (!i || i.expira < Date.now()) { res.status(404).json({ error: 'Esta invitación no existe o ya venció. Pide un nuevo QR a la agencia.' }); return null; }
  return i;
};
app.get('/api/alta/:t', (req, res) => {
  const i = invite(req, res); if (!i) return;
  const c = db.clients.find((x) => x.id === i.clientId);
  res.json({
    agencia: { nombre: db.agency.nombre || 'la agencia', tieneLogo: !!db.agency.logo },
    estilos: ESTILOS.map(({ id, emoji, nombre, descripcion }) => ({ id, emoji, nombre, descripcion })),
    carpetas: files.CARPETAS.map((n) => ({ nombre: n, ayuda: files.AYUDA[n] })),
    cliente: c ? clientSummary(c) : null, estado: i.estado, tipo: i.tipo || 'alta', REF: files.REF, CRUDO: files.CRUDO,
  });
});
app.post('/api/alta/:t', (req, res) => {
  const i = invite(req, res); if (!i) return;
  const body = { ...(req.body || {}) }; delete body.logo;
  let c = db.clients.find((x) => x.id === i.clientId);
  if (!c) {
    if (!String(body.nombre || '').trim()) return res.status(400).json({ error: 'Escribe el nombre de tu marca' });
    c = cleanClient(body, { id: newId('cl'), creado: Date.now(), origen: 'formulario QR' });
    db.clients.push(c); i.clientId = c.id;
  } else Object.assign(c, cleanClient(body, c));
  if (body.final) {
    i.estado = 'completada'; i.completada = Date.now();
    log('jefe', `🆕 Nuevo cliente por QR: ${c.nombre}${c.contacto?.nombre ? ` (contacto: ${c.contacto.nombre})` : ''}`);
    bus.emit('nuevo-cliente', c);
  }
  save(); bus.emit('client', clientSummary(c));
  res.json({ ok: true, clientId: c.id });
});
app.get('/api/alta/:t/files', (req, res) => {
  const i = invite(req, res); if (!i) return;
  if (!i.clientId) return res.json({ carpetas: [] });
  res.json({ carpetas: files.listar(i.clientId).map((c) => ({ carpeta: c.carpeta, archivos: c.archivos.map((a) => a.nombre) })) });
});
app.put('/api/alta/:t/files', async (req, res) => {
  const i = invite(req, res); if (!i) return;
  if (!i.clientId) return res.status(400).json({ error: 'Primero escribe el nombre de tu marca' });
  if (Number(req.headers['content-length'] || 0) > 100 * 1024 * 1024) return res.status(400).json({ error: 'Máximo 100 MB por archivo' });
  try {
    const carpeta = String(req.query.carpeta || files.REF);
    if (![files.REF, files.CRUDO].includes(carpeta)) return res.status(400).json({ error: 'Esa carpeta no está disponible' });
    const sub = String(req.query.sub || '').slice(0, 40) === 'Logos' ? 'Logos' : '';
    const r = await files.recibir(req, i.clientId, carpeta, sub, String(req.query.nombre || ''));
    // Si es su logo y aún no tiene uno en su kit de marca, se usa automáticamente.
    const c = db.clients.find((x) => x.id === i.clientId);
    if (c && !c.logo && r.ruta.startsWith(`${files.REF}/Logos/`) && /\.(png|jpe?g|webp|svg)$/i.test(r.nombre) && r.tam < 650000) {
      const ext = r.nombre.split('.').pop().toLowerCase();
      c.logo = `data:image/${ext === 'jpg' ? 'jpeg' : ext === 'svg' ? 'svg+xml' : ext};base64,${fs.readFileSync(files.safePath(c.id, r.ruta).full).toString('base64')}`;
      c.actualizado = Date.now(); save(); bus.emit('client', clientSummary(c));
    }
    log('jefe', `📁 El cliente subió ${r.ruta}`); filesChanged(i.clientId); res.json({ nombre: r.nombre });
  } catch (e) { res.status(400).json({ error: e.message }); }
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
  const c = { id: newId('c'), clientId: cl?.id || null, cliente: cliente.trim(), brief: brief.trim(), estado: 'en_curso', creada: Date.now(), costo: 0, objetivo: req.body?.objetivo || null, mes: /^\d{4}-\d{2}$/.test(req.body?.mes || '') ? req.body.mes : new Date().toISOString().slice(0, 7), etiquetas: [] };
  db.campaigns.push(c);
  save();
  log('jefe', `Nueva campaña: ${c.cliente}`, c.id);
  bus.emit('campaign', c);
  try { ws.brief(c); } catch (e) { console.warn('[ws]', e.message); }
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

costos.registrar(app);
voz.registrar(app);
render.registrar(app);
musica.registrar(app);
planeacion.registrar(app, { baseUrl, runCampaign: (c) => runtime.runCampaign(c), track, clientSummary, ws });

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
const extOf = (p) => (p.motor === 'v2' ? 'json' : EXT[p.tipo] || 'txt');
function pieceBody(p) {
  if (p.tipo === 'texto') return p.contenido;
  const camp = db.campaigns.find((x) => x.id === p.campaignId);
  const logo = db.clients.find((x) => x.id === camp?.clientId)?.logo || '';
  return p.contenido.replaceAll('{{LOGO}}', logo);
}
const fileName = (p) => { const b = slug(p.titulo); return `${/-v\d+$/.test(b) ? b : `${b}-v${p.version || 1}`}.${extOf(p)}`; };

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
  res.type(p.motor === 'v2' ? 'application/json' : { arte: 'image/svg+xml', video: 'text/html', texto: 'text/plain; charset=utf-8' }[p.tipo] || 'text/plain').send(pieceBody(p));
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

// ---- Entregables: guardar el video exportado y descargar todo lo aprobado ----
app.put('/api/pieces/:id/video', async (req, res) => {
  const p = db.pieces.find((x) => x.id === req.params.id);
  const donde = p && entregables.carpetaPieza(p);
  if (!donde) return res.status(404).json({ error: 'Esta pieza no tiene cliente asignado' });
  const ext = ['mp4', 'webm'].includes(req.query.ext) ? req.query.ext : 'mp4';
  try {
    files.ensureFolders(donde.clientId);
    const nombre = `${(ws.slug(p.titulo) || 'video')}.${ext}`;
    const r = await files.recibir(req, donde.clientId, files.FINAL, donde.sub, nombre);
    p.mediaRuta = r.ruta; save();
    log('jefe', `💾 Guardó el video "${p.titulo}" en ${r.ruta}`, p.campaignId); bus.emit('files', { clientId: donde.clientId });
    res.json(r);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Todo lo aprobado de un cliente (o sus archivos completos con ?todo=1) en un ZIP
app.get('/api/clients/:id/zip', (req, res) => {
  const c = db.clients.find((x) => x.id === req.params.id);
  if (!c) return res.status(404).end();
  const raiz = files.clientDir(c.id);
  const lista = [];
  const rec = (dir, pre) => { if (!fs.existsSync(dir)) return; for (const d of fs.readdirSync(dir, { withFileTypes: true })) { if (d.name.startsWith('.')) continue; const f = path.join(dir, d.name); d.isDirectory() ? rec(f, `${pre}${d.name}/`) : lista.push({ f, n: `${pre}${d.name}` }); } };
  rec(req.query.todo ? raiz : path.join(raiz, files.FINAL), '');
  const total = lista.reduce((n, x) => n + fs.statSync(x.f).size, 0);
  if (total > 400 * 1024 * 1024) return res.status(413).json({ error: 'Es demasiado grande para un solo ZIP. Descarga por campaña desde el Archivo.' });
  if (!lista.length) return res.status(404).json({ error: 'Todavía no hay entregables aprobados de este cliente.' });
  res.setHeader('Content-Disposition', `attachment; filename="${slug(c.nombre)}-${req.query.todo ? 'archivos' : 'aprobados'}.zip"`);
  res.type('application/zip').send(makeZip(lista.map((x) => ({ name: x.n, data: fs.readFileSync(x.f) }))));
});

// ---- Computadora de cada agente ----
app.get('/api/agents/:id/pc', (req, res) => {
  const a = publicRoster().find((x) => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'Agente inexistente' });
  const st = agentState[a.id] || {};
  const job = [...db.jobs].reverse().find((j) => j.agentId === a.id && j.estado === 'activo') || [...db.jobs].reverse().find((j) => j.agentId === a.id);
  const camp = db.campaigns.find((c) => c.id === (st.campaignId || job?.campaignId));
  let dicho = '', herramientas = [];
  for (const m of [...(job?.messages || [])].reverse()) {
    if (m.role !== 'assistant' || !Array.isArray(m.content)) continue;
    dicho = m.content.filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim().slice(0, 600);
    herramientas = m.content.filter((b) => b.type === 'tool_use').map((b) => b.name);
    break;
  }
  const mias = db.pieces.filter((p) => p.agente === a.id);
  res.json({
    agente: a,
    ahora: { estado: st.estado || 'libre', burbuja: st.burbuja || '', pensandoDesde: st.pensando || null },
    campana: camp ? { id: camp.id, cliente: camp.cliente, fase: camp.fase || null, estado: camp.estado, brief: camp.brief.slice(0, 300) } : null,
    tarea: job && job.estado !== 'terminado' ? job.task.slice(0, 700) : null,
    ultimaTarea: job && job.estado === 'terminado' ? { tarea: job.task.slice(0, 300), resultado: String(job.resultado || '').slice(0, 600) } : null,
    dicho, herramientas,
    esperando: { solicitudes: db.requests.filter((r) => r.agente === a.id && r.estado === 'pendiente').map((r) => ({ tipo: r.tipo, texto: r.texto })), piezas: mias.filter((p) => p.estado === 'pendiente').map((p) => p.titulo) },
    entregas: { total: mias.length, aprobadas: mias.filter((p) => p.estado === 'aprobada').length, rechazadas: mias.filter((p) => p.estado === 'rechazada').length },
    reciente: db.log.filter((l) => l.agente === a.id).slice(-12).reverse(),
    espacio: ws.listar(a.id),
    compartido: ws.listar(ws.COMPARTIDO),
  });
});
app.get('/api/espacios/:id/archivo', (req, res) => { try { ws.enviar(res, req.params.id, String(req.query.path || '')); } catch (e) { res.status(400).json({ error: e.message }); } });

// ---- Video v2: estilos virales, guion del video y tomas reales ----
app.get('/api/estilos', (req, res) => res.json({ estilos: ESTILOS, broll: brollDisponible() }));
const previews = new Map();
app.get('/api/estilos/:id/preview', async (req, res) => {
  const e = estiloById[req.params.id];
  if (!e) return res.status(404).json({ error: 'Estilo inexistente' });
  const cl = db.clients.find((x) => x.id === req.query.cliente);
  const k = `${e.id}|${cl?.id || ''}|${cl?.actualizado || ''}`;
  if (!previews.has(k)) previews.set(k, await resolveBroll(demoSpec(e.id, cl || {})));
  res.json({ spec: previews.get(k), titulo: `${e.emoji} ${e.nombre}`, estilo: e.descripcion, logoUrl: cl?.logo ? `/api/clients/${cl.id}/logo?v=${cl.actualizado || ''}` : null, clientId: cl?.id, broll: brollDisponible() });
});
app.post('/api/clients/:id/sugerir-estilos', (req, res) => {
  const cl = db.clients.find((x) => x.id === req.params.id);
  if (!cl) return res.status(404).json({ error: 'No existe' });
  res.json({ sugeridos: sugerirEstilos(cl) });
});
app.get('/api/broll/estado', async (req, res) => res.json(await diagnosticoBroll(String(req.query.q || 'coffee shop'), String(req.query.o || 'portrait'))));
let pruebaCache = null;
app.get('/api/prueba/chatbot', async (req, res) => {
  try {
    if (!pruebaCache || req.query.nuevo) {
      const spec = pruebaChatbot();
      await resolveBroll(spec);
      const v = await voz.agregarVoz(spec, { campaignId: null, agente: 'video' });
      const mus = await musica.agregarMusica(spec, { campaignId: null, agente: 'video' });
      pruebaCache = { spec, estado: { tomasReales: spec.escenas.filter((e) => e.fondo.clip).length, escenas: spec.escenas.length, voz: v, musica: mus, vozLlave: voz.vozDisponible(), fuentes: await diagnosticoBroll() } };
    }
    res.json({ ...pruebaCache, titulo: 'Prueba: chatbots para negocios', estilo: 'Video de prueba', broll: brollDisponible() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/broll/proxy', (req, res) => proxyBroll(req, res).catch(() => res.status(502).end()));
app.get('/api/pieces/:id/spec', (req, res) => {
  const p = db.pieces.find((x) => x.id === req.params.id);
  if (!p || p.motor !== 'v2') return res.status(404).json({ error: 'Video no encontrado' });
  const camp = db.campaigns.find((x) => x.id === p.campaignId);
  const cl = db.clients.find((x) => x.id === camp?.clientId);
  const spec = JSON.parse(p.contenido);
  res.json({ spec, titulo: p.titulo, estilo: estiloById[spec.estilo] ? `${estiloById[spec.estilo].emoji} ${estiloById[spec.estilo].nombre}` : '', logoUrl: cl?.logo ? `/api/clients/${cl.id}/logo?v=${cl.actualizado || ''}` : null, clientId: cl?.id, broll: brollDisponible() });
});

// Las piezas se sirven en una "caja de arena": su código no puede tocar la app.
app.get('/api/pieces/:id/render', (req, res) => {
  const p = db.pieces.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).end();
  if (p.motor === 'v2') return res.redirect(302, `/player.html?id=${p.id}&embed=1`);
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
bus.on('files', (f) => broadcast('files', f));
bus.on('course', (c) => broadcast('course', c));

startTelegram();
// Retoma lo que estaba en curso antes del reinicio.
for (const { campaign, promise } of runtime.boot()) track(campaign, promise);
initCursos(runtime);
server.listen(PORT, () => {
  render.iniciarRender(PORT);
  console.log(`\n🏢 Agencia IA en http://localhost:${PORT}${KEY ? `/?key=${KEY}` : ''}`);
  console.log(DEMO ? '🎭 MODO DEMO (sin API key de Claude: los agentes siguen un guion)' : `🤖 Agentes reales con ${process.env.CLAUDE_MODEL || 'claude-opus-5-5'}`);
});

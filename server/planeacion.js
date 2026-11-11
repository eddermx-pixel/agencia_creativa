// Planeación mensual por objetivos, búsqueda de campañas, métricas y publicación por GoHighLevel.
import Anthropic from '@anthropic-ai/sdk';
import { modeloPara, verificar } from './presupuesto.js';
import { db, save, newId } from './store.js';
import { bus, log, addUsage } from './hub.js';
import * as files from './files.js';
import fs from 'node:fs';

export const OBJETIVOS = {
  reconocimiento: '👀 Reconocimiento (que más gente nos conozca)',
  trafico: '🖱️ Tráfico (visitas al sitio / perfil)',
  leads: '🧲 Leads (contactos y prospectos)',
  ventas: '💰 Ventas (conversión)',
  fidelizacion: '💜 Fidelización (clientes actuales)',
  lanzamiento: '🚀 Lanzamiento (producto u oferta nueva)',
  comunidad: '💬 Comunidad (interacción)',
};
export const PLATAFORMAS = ['instagram', 'facebook', 'tiktok', 'linkedin', 'youtube', 'google', 'whatsapp', 'otra'];
const FORMATOS = ['reel', 'carrusel', 'post', 'historia', 'anuncio', 'texto'];
const ESTADOS_PLAN = ['idea', 'en_produccion', 'aprobada', 'programada', 'publicada'];
const num = (v) => (Number.isFinite(+v) && +v >= 0 ? +v : 0);
const mesOk = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m || '');
export const mesActual = () => new Date().toISOString().slice(0, 7);

db.plan ||= []; db.metricas ||= [];

// ---------- Planes ----------
function limpiaItem(b, base = {}) {
  const o = { ...base };
  if (b.clientId !== undefined) o.clientId = b.clientId || null;
  if (b.fecha !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(b.fecha)) { o.fecha = b.fecha; o.mes = b.fecha.slice(0, 7); }
  if (b.hora !== undefined && /^\d{2}:\d{2}$/.test(b.hora)) o.hora = b.hora;
  if (b.objetivo !== undefined && OBJETIVOS[b.objetivo]) o.objetivo = b.objetivo;
  if (b.plataforma !== undefined && PLATAFORMAS.includes(b.plataforma)) o.plataforma = b.plataforma;
  if (b.formato !== undefined && FORMATOS.includes(b.formato)) o.formato = b.formato;
  if (b.tema !== undefined) o.tema = String(b.tema).slice(0, 200);
  if (b.notas !== undefined) o.notas = String(b.notas).slice(0, 800);
  if (b.estado !== undefined && ESTADOS_PLAN.includes(b.estado)) o.estado = b.estado;
  return o;
}
const nombreCliente = (id) => db.clients.find((c) => c.id === id)?.nombre || '';

export function metaCliente(cl) {
  return [cl.objetivo && `Objetivo de marca: ${cl.objetivo}`, cl.metas && `Metas y KPIs del mes: ${cl.metas}`, cl.ads && `Estrategia de ads (alinea el contenido orgánico con esto): ${cl.ads}`].filter(Boolean).join('\n');
}

// Qué ha funcionado mejor (para que el plan aprenda)
export function aprendizajeMetricas(clientId) {
  const r = resumen({ clientId });
  const top = (arr) => arr.filter((x) => x.clave !== '—').slice(0, 2).map((x) => `${x.clave} (${x.er}% interacción, ${x.piezas} pieza${x.piezas > 1 ? 's' : ''})`).join('; ');
  if (!r.total) return '';
  return `Resultados anteriores: lo que mejor ha funcionado → estilo: ${top(r.porEstilo) || 'sin datos'}; formato: ${top(r.porTipo) || 'sin datos'}; objetivo: ${top(r.porObjetivo) || 'sin datos'}.`;
}

function planDemo(cl, mes, n, objetivos) {
  const temas = ['Presenta tu producto estrella', 'Detrás de cámaras', 'Testimonio de un cliente', 'Tip rápido que ayuda a tu cliente', 'Promoción de la semana', 'Pregunta a la comunidad', 'Antes y después', 'Oferta con fecha límite'];
  const fm = [['instagram', 'reel'], ['facebook', 'post'], ['instagram', 'carrusel'], ['tiktok', 'reel'], ['instagram', 'historia']];
  const dias = new Date(+mes.slice(0, 4), +mes.slice(5), 0).getDate();
  return Array.from({ length: n }, (_, i) => {
    const [plataforma, formato] = fm[i % fm.length];
    return { fecha: `${mes}-${String(Math.min(dias, 1 + Math.round((i * (dias - 2)) / Math.max(1, n - 1)))).padStart(2, '0')}`, objetivo: objetivos[i % objetivos.length], plataforma, formato, tema: `${temas[i % temas.length]} — ${cl.nombre}`, notas: '' };
  });
}

async function planReal(cl, mes, n, objetivos) {
  const client = new Anthropic({ maxRetries: 3, timeout: 4 * 60 * 1000 });
  const mems = db.memories.filter((m) => m.clientId === cl.id).slice(-12).map((m) => `- ${m.texto}`).join('\n');
  const prompt = `Eres el director creativo de una agencia de marketing. Crea el plan de contenido de ${mes} para ${cl.nombre}.\n\n${metaCliente(cl) || '(sin metas definidas: propón objetivos razonables)'}\nRubro: ${cl.rubro || '-'}. Público: ${cl.publico || '-'}. Tono: ${cl.tono || '-'}.\nObjetivos prioritarios para este mes: ${objetivos.join(', ')}.\n${aprendizajeMetricas(cl.id)}\n${mems ? `Lo que sabemos del cliente:\n${mems}` : ''}\n\nPropón exactamente ${n} publicaciones repartidas en el mes (mezcla formatos y plataformas, alineadas con los ads descritos y con un embudo: atraer → convencer → convertir). Responde SOLO con un arreglo JSON, sin texto extra, con objetos {"fecha":"YYYY-MM-DD","objetivo":"${Object.keys(OBJETIVOS).join('|')}","plataforma":"${PLATAFORMAS.join('|')}","formato":"${FORMATOS.join('|')}","tema":"idea concreta","notas":"mensaje clave y llamada a la acción"}.`;
  verificar();
  const r = await client.messages.create({ model: modeloPara('director'), max_tokens: 4000, messages: [{ role: 'user', content: prompt }] });
  addUsage(null, r.model || modeloPara('director'), r.usage, 'director');
  const txt = r.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const m = txt.match(/\[[\s\S]*\]/);
  if (!m) throw new Error('La IA no devolvió un plan válido. Intenta de nuevo.');
  return JSON.parse(m[0]);
}

// ---------- Métricas ----------
function piezaInfo(p) {
  const camp = db.campaigns.find((c) => c.id === p.campaignId);
  const plan = db.plan.find((x) => x.id === p.planId) || db.plan.find((x) => x.pieceId === p.id);
  let estilo = '';
  if (p.motor === 'v2') { try { estilo = JSON.parse(p.contenido).estilo || ''; } catch {} }
  return { camp, plan, estilo: estilo || '—' };
}
const er = (m) => (m.alcance ? Math.round((m.interacciones / m.alcance) * 1000) / 10 : 0);

export function resumen({ clientId = '', mes = '' } = {}) {
  const ms = db.metricas.filter((m) => {
    const p = db.pieces.find((x) => x.id === m.pieceId);
    const camp = db.campaigns.find((c) => c.id === (p?.campaignId || m.campaignId));
    return (!clientId || camp?.clientId === clientId || m.clientId === clientId) && (!mes || (m.fecha || '').startsWith(mes));
  });
  const grupo = (fn) => {
    const g = {};
    for (const m of ms) {
      const p = db.pieces.find((x) => x.id === m.pieceId);
      const k = fn(m, p, p ? piezaInfo(p) : {}) || '—';
      const a = (g[k] ||= { clave: k, piezas: 0, alcance: 0, interacciones: 0, clics: 0, leads: 0, ventas: 0, gasto: 0 });
      a.piezas++; for (const f of ['alcance', 'interacciones', 'clics', 'leads', 'ventas', 'gasto']) a[f] += m[f] || 0;
    }
    return Object.values(g).map((a) => ({ ...a, er: a.alcance ? Math.round((a.interacciones / a.alcance) * 1000) / 10 : 0, cpl: a.leads && a.gasto ? Math.round((a.gasto / a.leads) * 100) / 100 : null })).sort((x, y) => y.er - x.er);
  };
  const tot = (f) => ms.reduce((n, m) => n + (m[f] || 0), 0);
  return {
    total: ms.length,
    totales: { alcance: tot('alcance'), interacciones: tot('interacciones'), clics: tot('clics'), leads: tot('leads'), ventas: tot('ventas'), gasto: tot('gasto') },
    porTipo: grupo((m, p) => p?.tipo || m.formato), porEstilo: grupo((m, p, i) => i.estilo), porObjetivo: grupo((m, p, i) => i.camp?.objetivo || i.plan?.objetivo || m.objetivo),
    porPlataforma: grupo((m) => m.plataforma), porAgente: grupo((m, p) => p?.agente),
    mejores: ms.map((m) => ({ ...m, er: er(m), titulo: db.pieces.find((x) => x.id === m.pieceId)?.titulo || m.titulo || 'Publicación' })).sort((a, b) => b.er - a.er).slice(0, 5),
  };
}

// ---------- GoHighLevel ----------
const GHL = process.env.GHL_API_URL || 'https://services.leadconnectorhq.com';
const ghlToken = () => process.env.GHL_TOKEN || '';
const locDe = (cl) => cl?.ghlLocationId || process.env.GHL_LOCATION_ID || '';
async function ghl(method, p, body) {
  const r = await fetch(`${GHL}${p}`, { method, headers: { Authorization: `Bearer ${ghlToken()}`, Version: '2021-07-28', 'Content-Type': 'application/json', Accept: 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`GoHighLevel ${r.status}: ${j.message || j.error || JSON.stringify(j).slice(0, 200)}`);
  return j;
}
let urlPublica = null;
export const setUrlPublica = (f) => { urlPublica = f; };
let BASE = '';
const ghlCfg = (cl) => ({ conectado: !!ghlToken(), locationId: locDe(cl) || null });

export async function publicar(p, { fecha, hora, cuentas }) {
  const camp = db.campaigns.find((c) => c.id === p.campaignId);
  const cl = db.clients.find((c) => c.id === camp?.clientId);
  if (!ghlToken()) throw new Error('Falta GHL_TOKEN en las variables de Railway.');
  const loc = locDe(cl);
  if (!loc) throw new Error('Falta el Location ID de GoHighLevel (en el kit del cliente o GHL_LOCATION_ID).');
  const ids = (cuentas?.length ? cuentas : cl?.ghlCuentas) || [];
  if (!ids.length) throw new Error('Elige a qué redes publicar (cuentas conectadas en GoHighLevel).');
  const media = [];
  if (p.tipo === 'texto') { /* solo texto */ }
  else if (p.mediaRuta && camp?.clientId && urlPublica) media.push({ url: urlPublica(camp.clientId, p.mediaRuta, BASE || process.env.PUBLIC_URL || ''), type: /\.(mp4|mov)$/i.test(p.mediaRuta) ? 'video/mp4' : 'image/png' });
  else throw new Error('Esta pieza no tiene imagen/video descargable. Abre la pieza y usa "Guardar en archivo del cliente" (video MP4) o sube el PNG, y vuelve a programar.');
  const when = new Date(`${fecha}T${hora || '10:00'}:00`);
  if (!(when > new Date())) throw new Error('La fecha y hora debe estar en el futuro.');
  const summary = p.tipo === 'texto' ? p.contenido : `${p.titulo}\n\n${p.descripcion || ''}`.trim();
  const j = await ghl('POST', `/social-media-posting/${loc}/posts`, { accountIds: ids, summary, media, type: 'post', status: 'scheduled', scheduleDate: when.toISOString(), userId: cl?.ghlUserId || process.env.GHL_USER_ID || undefined });
  p.ghl = { postId: j.results?.post?._id || j.post?._id || j._id || null, fecha: when.toISOString(), cuentas: ids };
  const plan = db.plan.find((x) => x.pieceId === p.id);
  if (plan) plan.estado = 'programada';
  save(); bus.emit('piece', p);
  log('director', `📅 Programada en GoHighLevel: "${p.titulo}" (${fecha} ${hora || '10:00'})`, p.campaignId);
  return p.ghl;
}

// ---------- Rutas ----------
export function registrar(app, { baseUrl, runCampaign, track, clientSummary, ws }) {
  app.use((req, res, next) => { if (!process.env.PUBLIC_URL) BASE = baseUrl(req); next(); });
  app.get('/api/objetivos', (req, res) => res.json({ objetivos: OBJETIVOS, plataformas: PLATAFORMAS, formatos: FORMATOS, estados: ESTADOS_PLAN, ghl: ghlCfg() }));

  // Buscar campañas por texto, objetivo, mes, cliente, estado
  app.get('/api/campaigns/search', (req, res) => {
    const q = String(req.query.q || '').toLowerCase().trim();
    const out = db.campaigns.filter((c) => (!req.query.objetivo || c.objetivo === req.query.objetivo) && (!req.query.mes || c.mes === req.query.mes) && (!req.query.cliente || c.clientId === req.query.cliente) && (!req.query.estado || c.estado === req.query.estado)
      && (!q || [c.cliente, c.brief, c.objetivo && OBJETIVOS[c.objetivo], ...(c.etiquetas || []), c.concepto?.titulo, c.concepto?.idea].some((t) => String(t || '').toLowerCase().includes(q))))
      .sort((a, b) => b.creada - a.creada).slice(0, 200)
      .map((c) => { const ps = db.pieces.filter((p) => p.campaignId === c.id); return { ...c, piezas: ps.length, aprobadas: ps.filter((p) => p.estado === 'aprobada').length, pendientes: ps.filter((p) => p.estado === 'pendiente').length, metricas: resumen({}).total ? db.metricas.filter((m) => ps.some((p) => p.id === m.pieceId)).length : 0 }; });
    res.json(out);
  });
  app.patch('/api/campaigns/:id', (req, res) => {
    const c = db.campaigns.find((x) => x.id === req.params.id);
    if (!c) return res.status(404).json({ error: 'No existe' });
    const b = req.body || {};
    if (b.objetivo !== undefined) c.objetivo = OBJETIVOS[b.objetivo] ? b.objetivo : null;
    if (b.mes !== undefined) c.mes = mesOk(b.mes) ? b.mes : null;
    if (Array.isArray(b.etiquetas)) c.etiquetas = b.etiquetas.map((t) => String(t).trim().slice(0, 30)).filter(Boolean).slice(0, 8);
    save(); bus.emit('campaign', c); res.json(c);
  });

  // Plan del mes
  app.get('/api/plan', (req, res) => {
    const mes = mesOk(req.query.mes) ? req.query.mes : mesActual();
    const items = db.plan.filter((x) => x.mes === mes && (!req.query.clientId || x.clientId === req.query.clientId)).sort((a, b) => (a.fecha + (a.hora || '')).localeCompare(b.fecha + (b.hora || '')))
      .map((x) => ({ ...x, cliente: nombreCliente(x.clientId), pieza: db.pieces.find((p) => p.id === x.pieceId)?.estado || null }));
    const cl = db.clients.find((c) => c.id === req.query.clientId);
    res.json({ mes, items, cliente: cl ? { id: cl.id, nombre: cl.nombre, objetivo: cl.objetivo || '', metas: cl.metas || '', ads: cl.ads || '' } : null, aprendizaje: cl ? aprendizajeMetricas(cl.id) : '' });
  });
  app.post('/api/plan', (req, res) => {
    const o = limpiaItem(req.body || {}, { id: newId('pl'), estado: 'idea', creada: Date.now(), objetivo: 'reconocimiento', plataforma: 'instagram', formato: 'post' });
    if (!o.fecha || !o.clientId || !o.tema) return res.status(400).json({ error: 'Falta cliente, fecha o tema' });
    db.plan.push(o); save(); res.json(o);
  });
  app.patch('/api/plan/:id', (req, res) => { const x = db.plan.find((p) => p.id === req.params.id); if (!x) return res.status(404).json({ error: 'No existe' }); Object.assign(x, limpiaItem(req.body || {}, x)); save(); res.json(x); });
  app.delete('/api/plan/:id', (req, res) => { const i = db.plan.findIndex((p) => p.id === req.params.id); if (i < 0) return res.status(404).json({ error: 'No existe' }); db.plan.splice(i, 1); save(); res.json({ ok: true }); });
  app.post('/api/plan/generar', async (req, res) => {
    const cl = db.clients.find((c) => c.id === req.body?.clientId);
    const mes = req.body?.mes;
    if (!cl || !mesOk(mes)) return res.status(400).json({ error: 'Elige cliente y mes' });
    const n = Math.max(3, Math.min(30, +req.body?.cantidad || 12));
    const objs = (Array.isArray(req.body?.objetivos) ? req.body.objetivos : []).filter((o) => OBJETIVOS[o]);
    const objetivos = objs.length ? objs : ['reconocimiento', 'leads', 'ventas'];
    try {
      const crudo = process.env.DEMO === '1' || !(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) ? planDemo(cl, mes, n, objetivos) : await planReal(cl, mes, n, objetivos);
      const nuevos = crudo.slice(0, 30).map((b) => limpiaItem({ ...b, clientId: cl.id }, { id: newId('pl'), estado: 'idea', creada: Date.now(), objetivo: objetivos[0], plataforma: 'instagram', formato: 'post' })).filter((o) => o.fecha?.startsWith(mes) && o.tema);
      if (req.body?.reemplazar) db.plan = db.plan.filter((x) => !(x.clientId === cl.id && x.mes === mes && x.estado === 'idea'));
      db.plan.push(...nuevos); save();
      res.json({ creados: nuevos.length });
    } catch (e) { res.status(502).json({ error: e.message }); }
  });
  // Convertir una idea del plan en campaña (los agentes la producen con el kit y los objetivos del cliente)
  app.post('/api/plan/:id/producir', (req, res) => {
    const x = db.plan.find((p) => p.id === req.params.id);
    const cl = db.clients.find((c) => c.id === x?.clientId);
    if (!x || !cl) return res.status(404).json({ error: 'No existe' });
    if (x.campaignId) return res.status(409).json({ error: 'Esta idea ya se está produciendo' });
    const brief = `Pieza del plan de ${x.mes}: ${x.tema}.\nObjetivo: ${OBJETIVOS[x.objetivo]}. Plataforma: ${x.plataforma}. Formato: ${x.formato}. Publicación prevista: ${x.fecha}${x.hora ? ` ${x.hora}` : ''}.${x.notas ? `\nNotas: ${x.notas}` : ''}\nAlinea el mensaje con las metas y la estrategia de ads de la marca.`;
    const c = { id: newId('c'), clientId: cl.id, cliente: cl.nombre, brief, estado: 'en_curso', creada: Date.now(), costo: 0, objetivo: x.objetivo, mes: x.mes, planId: x.id, etiquetas: [x.plataforma, x.formato] };
    db.campaigns.push(c); x.campaignId = c.id; x.estado = 'en_produccion'; save();
    log('jefe', `Nueva campaña desde el plan: ${x.tema}`, c.id); bus.emit('campaign', c);
    try { ws.brief(c); } catch {}
    track(c, runCampaign(c));
    res.json(c);
  });

  // Métricas
  app.get('/api/metricas', (req, res) => res.json({ resumen: resumen({ clientId: req.query.clientId || '', mes: req.query.mes || '' }), registros: db.metricas.slice(-200).reverse() }));
  app.get('/api/metricas/piezas', (req, res) => res.json(db.pieces.filter((p) => p.estado === 'aprobada').slice(-100).reverse().map((p) => { const i = piezaInfo(p); return { id: p.id, titulo: p.titulo, tipo: p.tipo, cliente: i.camp?.cliente || '', clientId: i.camp?.clientId, estilo: i.estilo, objetivo: i.camp?.objetivo || i.plan?.objetivo || null }; })));
  app.post('/api/metricas', (req, res) => {
    const b = req.body || {};
    const p = db.pieces.find((x) => x.id === b.pieceId);
    if (!p && !(b.titulo && b.clientId)) return res.status(400).json({ error: 'Elige la pieza (o escribe título y cliente)' });
    const m = { id: newId('mt'), pieceId: p?.id || null, clientId: b.clientId || null, titulo: String(b.titulo || '').slice(0, 120), plataforma: PLATAFORMAS.includes(b.plataforma) ? b.plataforma : 'otra', formato: FORMATOS.includes(b.formato) ? b.formato : null, objetivo: OBJETIVOS[b.objetivo] ? b.objetivo : null, fecha: /^\d{4}-\d{2}-\d{2}/.test(b.fecha) ? b.fecha.slice(0, 10) : new Date().toISOString().slice(0, 10), alcance: num(b.alcance), impresiones: num(b.impresiones), interacciones: num(b.interacciones), clics: num(b.clics), leads: num(b.leads), ventas: num(b.ventas), gasto: num(b.gasto), fuente: 'manual', creada: Date.now() };
    db.metricas.push(m); save();
    res.json(m);
  });
  app.delete('/api/metricas/:id', (req, res) => { const i = db.metricas.findIndex((m) => m.id === req.params.id); if (i < 0) return res.status(404).json({ error: 'No existe' }); db.metricas.splice(i, 1); save(); res.json({ ok: true }); });

  // GoHighLevel
  app.get('/api/ghl/estado', (req, res) => res.json(ghlCfg(db.clients.find((c) => c.id === req.query.clientId))));
  app.get('/api/ghl/cuentas', async (req, res) => {
    try {
      const cl = db.clients.find((c) => c.id === req.query.clientId);
      if (!ghlToken()) throw new Error('Falta GHL_TOKEN en las variables de Railway.');
      const loc = locDe(cl); if (!loc) throw new Error('Falta el Location ID de GoHighLevel.');
      const j = await ghl('GET', `/social-media-posting/${loc}/accounts`);
      const lista = j.results?.accounts || j.accounts || [];
      res.json(lista.map((a) => ({ id: a.id || a._id, nombre: a.name || a.profileName || a.platform, plataforma: a.platform || a.type })));
    } catch (e) { res.status(502).json({ error: e.message }); }
  });
  app.post('/api/pieces/:id/programar', async (req, res) => {
    const p = db.pieces.find((x) => x.id === req.params.id);
    if (!p) return res.status(404).json({ error: 'No existe' });
    if (p.estado !== 'aprobada') return res.status(409).json({ error: 'Primero aprueba la pieza.' });
    try { res.json(await publicar(p, { fecha: String(req.body?.fecha || ''), hora: req.body?.hora, cuentas: req.body?.cuentas })); } catch (e) { res.status(400).json({ error: e.message }); }
  });
  // Al aprobar una pieza ligada a un plan con fecha: se programa sola si el cliente lo activó
  bus.on('piece', (p) => {
    if (p.estado !== 'aprobada' || p.ghl || p.autoGhl === false) return;
    const camp = db.campaigns.find((c) => c.id === p.campaignId);
    const plan = db.plan.find((x) => x.id === camp?.planId);
    const cl = db.clients.find((c) => c.id === camp?.clientId);
    if (!plan || !plan.fecha) return;
    if (!plan.pieceId) { plan.pieceId = p.id; plan.estado = 'aprobada'; save(); }
    if (cl?.ghlAuto && ghlToken()) publicar(p, { fecha: plan.fecha, hora: plan.hora }).catch((e) => log('director', `⚠️ No se pudo programar en GoHighLevel: ${e.message}`, p.campaignId));
  });
}

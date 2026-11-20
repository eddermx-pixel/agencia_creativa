// GoHighLevel a nivel AGENCIA (app privada del Marketplace): un solo permiso da acceso a TODAS las subcuentas.
//   1. El dueño abre /api/ghl/conectar → GHL le pide autorizar la app → vuelve a /oauth/pixel/callback con un código.
//   2. El código se cambia por un token de agencia (y un refresh token que GHL rota en cada uso: se guarda en la base).
//   3. Con el token de agencia se pide un token por subcuenta (POST /oauth/locationToken, dura ~24 h) y se lista cada subcuenta.
// Variables: GHL_CLIENT_ID, GHL_CLIENT_SECRET (de la app en marketplace.gohighlevel.com). Sin ellas todo sigue como antes (GHL_TOKEN de Pixel).
import crypto from 'node:crypto';
import { db, save } from './store.js';

const API = process.env.GHL_API_URL || 'https://services.leadconnectorhq.com';
const AUTH = 'https://marketplace.gohighlevel.com/oauth/chooselocation';
export const SCOPES = [
  'locations.readonly', 'oauth.readonly', 'oauth.write', 'users.readonly',
  'socialplanner/post.write', 'socialplanner/post.readonly', 'socialplanner/account.readonly', 'socialplanner/account.write', 'socialplanner/oauth.readonly', 'socialplanner/category.readonly', 'socialplanner/tag.readonly',
  'contacts.readonly', 'conversations.readonly', 'conversations/message.readonly', 'opportunities.readonly', 'opportunities.write',
  'calendars.readonly', 'calendars/events.readonly', 'workflows.readonly', 'medias.readonly', 'medias.write', 'forms.readonly',
];
const id = () => process.env.GHL_CLIENT_ID || '';
const secreto = () => process.env.GHL_CLIENT_SECRET || '';
export const configurado = () => !!(id() && secreto());
const est = () => {
  const e = (db.agency.ghlOauth ||= {});
  if (e.userType === 'Location' && !e.migrado) { for (const k of ['access', 'refresh', 'expira']) delete e[k]; e.migrado = true; save(); } // antes se guardaba como si fuera de agencia
  return e;
};
const subs = () => (est().locs ||= {});
// Vía simple: un Private Integration de AGENCIA (GHL_AGENCY_TOKEN + GHL_COMPANY_ID). Vía app del Marketplace: OAuth (refresh rotativo).
const fijo = () => process.env.GHL_AGENCY_TOKEN || '';
const companyId = () => process.env.GHL_COMPANY_ID || est().companyId || '';
export const conectada = () => !!(fijo() && companyId()) || !!est().refresh;
export const puede = (loc) => !!subs()[loc]?.refresh || conectada();
export const instaladas = () => Object.keys(subs());

async function pedir(ruta, cuerpo, cabeceras = {}) {
  const r = await fetch(`${API}${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': 'AgenciaIA/1.0', Version: '2021-07-28', ...cabeceras }, body: new URLSearchParams(cuerpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`GoHighLevel ${r.status}: ${j.error_description || j.message || j.error || JSON.stringify(j).slice(0, 160)}`);
  return j;
}

function guardar(j) {
  const e = est();
  if (j.userType === 'Location' && j.locationId) { // instalada en UNA subcuenta: su propio token y refresh
    subs()[j.locationId] = { access: j.access_token, refresh: j.refresh_token || subs()[j.locationId]?.refresh, expira: Date.now() + (j.expires_in || 86399) * 1000, scope: j.scope, desde: subs()[j.locationId]?.desde || Date.now() };
    e.companyId = j.companyId || e.companyId; save(); return j.locationId;
  }
  e.access = j.access_token; e.refresh = j.refresh_token || e.refresh; e.expira = Date.now() + (j.expires_in || 86399) * 1000;
  e.companyId = j.companyId || e.companyId; e.userType = j.userType || e.userType; e.scope = j.scope || e.scope; e.conectada = e.conectada || Date.now();
  save();
  return null;
}

// El `state` va firmado (hora + HMAC con el secreto de la agencia): no depende de nada guardado, así sobrevive a reinicios y a abrir el enlace dos veces.
const firmar = (ts) => crypto.createHmac('sha256', db.agency.pubSecret || 'x').update(`ghl-oauth|${ts}`).digest('hex').slice(0, 32);
const nuevoState = () => { const ts = Date.now(); return `${ts}.${firmar(ts)}`; };
const stateValido = (st) => { const [ts, f] = String(st || '').split('.'); return !!ts && f === firmar(ts) && Date.now() - +ts < 30 * 60000; };

let renovando = null; // el refresh token es de un solo uso: nunca dos renovaciones a la vez
async function tokenAgencia() {
  const e = est();
  if (!e.refresh && fijo()) return fijo(); // la app del Marketplace (con permisos de subcuenta) manda sobre el token fijo
  if (!e.refresh) throw new Error('La agencia aún no está autorizada en GoHighLevel (abre /api/ghl/conectar).');
  if (e.access && e.expira - Date.now() > 300000) return e.access;
  renovando ||= pedir('/oauth/token', { client_id: id(), client_secret: secreto(), grant_type: 'refresh_token', refresh_token: e.refresh, user_type: 'Company' })
    .then((j) => { guardar(j); return est().access; })
    .finally(() => { renovando = null; });
  return renovando;
}

const porSub = new Map(); // locationId -> { token, exp }
const renovandoSub = new Map();
async function tokenInstalada(locationId) {
  const x = subs()[locationId];
  if (x.access && x.expira - Date.now() > 300000) return x.access;
  if (!renovandoSub.has(locationId)) renovandoSub.set(locationId, pedir('/oauth/token', { client_id: id(), client_secret: secreto(), grant_type: 'refresh_token', refresh_token: x.refresh, user_type: 'Location' })
    .then((j) => { guardar({ ...j, userType: 'Location', locationId }); return subs()[locationId].access; })
    .finally(() => renovandoSub.delete(locationId)));
  return renovandoSub.get(locationId);
}
export async function tokenSubcuenta(locationId) {
  if (subs()[locationId]?.refresh) return tokenInstalada(locationId);
  const c = porSub.get(locationId);
  if (c && c.exp - Date.now() > 300000) return c.token;
  const t = await tokenAgencia();
  const j = await pedir('/oauth/locationToken', { companyId: companyId(), locationId }, { Authorization: `Bearer ${t}` });
  porSub.set(locationId, { token: j.access_token, exp: Date.now() + (j.expires_in || 86399) * 1000 });
  return j.access_token;
}

let listaCache = { t: 0, datos: [] };
export async function subcuentas(forzar = false) {
  if (!forzar && Date.now() - listaCache.t < 600000) return listaCache.datos;
  const t = await tokenAgencia();
  const out = [];
  for (let skip = 0; skip < 1000; skip += 100) {
    const r = await fetch(`${API}/locations/search?companyId=${companyId()}&limit=100&skip=${skip}`, { headers: { Authorization: `Bearer ${t}`, Version: '2021-07-28', Accept: 'application/json', 'User-Agent': 'AgenciaIA/1.0' } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`GoHighLevel ${r.status}: ${j.message || JSON.stringify(j).slice(0, 160)}`);
    out.push(...(j.locations || []).map((l) => ({ id: l.id, nombre: l.name, empresa: l.business?.name || '', ciudad: l.city || '' })));
    if ((j.locations || []).length < 100) break;
  }
  listaCache = { t: Date.now(), datos: out };
  return out;
}

export function registrar(app, baseUrl) {
  const redirect = (req) => `${baseUrl(req)}/oauth/pixel/callback`;
  app.get('/api/ghl/conectar', (req, res) => {
    if (!configurado()) return res.status(400).send('Faltan GHL_CLIENT_ID y GHL_CLIENT_SECRET en las variables de Railway.');
    const q = new URLSearchParams({ response_type: 'code', redirect_uri: redirect(req), client_id: id(), scope: SCOPES.join(' '), state: nuevoState(), version_id: id().split('-')[0] }); // version_id: GHL lo exige mientras la app está en borrador
    res.redirect(`${AUTH}?${q}`);
  });
  app.get('/oauth/pixel/callback', async (req, res) => {
    try {
      if (!req.query.code) throw new Error(req.query.error_description || req.query.error || 'GoHighLevel no devolvió el código.');
      if (!stateValido(req.query.state)) throw new Error('La autorización caducó o no es válida. Vuelve a empezar desde /api/ghl/conectar.');
      const cuerpo = { client_id: id(), client_secret: secreto(), grant_type: 'authorization_code', code: String(req.query.code), redirect_uri: redirect(req) };
      let j;
      try { j = await pedir('/oauth/token', { ...cuerpo, user_type: 'Company' }); } catch { j = await pedir('/oauth/token', { ...cuerpo, user_type: 'Location' }); }
      const loc = guardar(j);
      listaCache.t = 0;
      res.redirect(`/clientes.html?ghl=conectado${loc ? `&sub=${encodeURIComponent(loc)}` : ''}`);
    } catch (err) { res.status(400).send(`No se pudo conectar GoHighLevel: ${String(err.message).replace(/[<>&]/g, '')}`); }
  });
  app.get('/api/ghl/subcuentas', async (req, res) => {
    try {
      const lista = conectada() ? await subcuentas(req.query.forzar === '1') : [];
      res.json({ configurado: configurado(), conectada: conectada(), companyId: companyId() || null, vias: { token: !!fijo(), app: !!est().refresh }, instaladas: instaladas(), subcuentas: lista.map((x) => ({ ...x, instalada: !!subs()[x.id]?.refresh })) });
    } catch (err) { res.status(502).json({ error: err.message, configurado: configurado(), conectada: conectada(), instaladas: instaladas() }); }
  });
}

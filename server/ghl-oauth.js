// GoHighLevel a nivel AGENCIA (app privada del Marketplace): un solo permiso da acceso a TODAS las subcuentas.
//   1. El dueño abre /api/ghl/conectar → GHL le pide autorizar la app → vuelve a /oauth/ghl/callback con un código.
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
const est = () => (db.agency.ghlOauth ||= {});
// Vía simple: un Private Integration de AGENCIA (GHL_AGENCY_TOKEN + GHL_COMPANY_ID). Vía app del Marketplace: OAuth (refresh rotativo).
const fijo = () => process.env.GHL_AGENCY_TOKEN || '';
const companyId = () => process.env.GHL_COMPANY_ID || est().companyId || '';
export const conectada = () => !!(fijo() && companyId()) || !!est().refresh;

async function pedir(ruta, cuerpo, cabeceras = {}) {
  const r = await fetch(`${API}${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': 'AgenciaIA/1.0', Version: '2021-07-28', ...cabeceras }, body: new URLSearchParams(cuerpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`GoHighLevel ${r.status}: ${j.error_description || j.message || j.error || JSON.stringify(j).slice(0, 160)}`);
  return j;
}

function guardar(j) {
  const e = est();
  e.access = j.access_token; e.refresh = j.refresh_token || e.refresh; e.expira = Date.now() + (j.expires_in || 86399) * 1000;
  e.companyId = j.companyId || e.companyId; e.userType = j.userType || e.userType; e.scope = j.scope || e.scope; e.conectada = e.conectada || Date.now();
  save();
}

let renovando = null; // el refresh token es de un solo uso: nunca dos renovaciones a la vez
async function tokenAgencia() {
  if (fijo()) return fijo();
  const e = est();
  if (!e.refresh) throw new Error('La agencia aún no está autorizada en GoHighLevel (abre /api/ghl/conectar).');
  if (e.access && e.expira - Date.now() > 300000) return e.access;
  renovando ||= pedir('/oauth/token', { client_id: id(), client_secret: secreto(), grant_type: 'refresh_token', refresh_token: e.refresh, user_type: 'Company' })
    .then((j) => { guardar(j); return est().access; })
    .finally(() => { renovando = null; });
  return renovando;
}

const porSub = new Map(); // locationId -> { token, exp }
export async function tokenSubcuenta(locationId) {
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
  const redirect = (req) => `${baseUrl(req)}/oauth/ghl/callback`;
  app.get('/api/ghl/conectar', (req, res) => {
    if (!configurado()) return res.status(400).send('Faltan GHL_CLIENT_ID y GHL_CLIENT_SECRET en las variables de Railway.');
    const e = est(); e.state = crypto.randomBytes(16).toString('hex'); save();
    const q = new URLSearchParams({ response_type: 'code', redirect_uri: redirect(req), client_id: id(), scope: SCOPES.join(' '), state: e.state });
    res.redirect(`${AUTH}?${q}`);
  });
  app.get('/oauth/ghl/callback', async (req, res) => {
    try {
      const e = est();
      if (!req.query.code) throw new Error(req.query.error_description || req.query.error || 'GoHighLevel no devolvió el código.');
      if (!e.state || req.query.state !== e.state) throw new Error('El estado de la autorización no coincide. Vuelve a empezar desde /api/ghl/conectar.');
      e.state = null;
      guardar(await pedir('/oauth/token', { client_id: id(), client_secret: secreto(), grant_type: 'authorization_code', code: String(req.query.code), user_type: 'Company', redirect_uri: redirect(req) }));
      listaCache.t = 0;
      res.redirect('/clientes.html?ghl=conectado');
    } catch (err) { res.status(400).send(`No se pudo conectar GoHighLevel: ${String(err.message).replace(/[<>&]/g, '')}`); }
  });
  app.get('/api/ghl/subcuentas', async (req, res) => {
    try {
      res.json({ configurado: configurado(), conectada: conectada(), companyId: companyId() || null, vias: { token: !!fijo(), app: !!est().refresh }, subcuentas: conectada() ? await subcuentas(req.query.forzar === '1') : [] });
    } catch (err) { res.status(502).json({ error: err.message, configurado: configurado(), conectada: conectada() }); }
  });
}

// Voz en off con ElevenLabs. Genera un MP3 por escena y lo guarda en disco (se reutiliza si el texto no cambia).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR, db, save } from './store.js';

const API = process.env.ELEVENLABS_API_URL || 'https://api.elevenlabs.io';
const DIR = path.join(DATA_DIR, 'voz');
// ELEVENLABS_VOICE_ID acepta una o varias voces separadas por coma. Con nombre: "Sofia:abc123, Carlos:def456".
export function voces() {
  return (process.env.ELEVENLABS_VOICE_ID || '').split(',').map((x) => x.trim()).filter(Boolean).map((x) => { const i = x.indexOf(':'); return i > 0 ? { nombre: x.slice(0, i).trim(), id: x.slice(i + 1).trim() } : { nombre: x.slice(0, 6), id: x }; });
}
// ELEVENLABS_VOICES_EXTRA: voces que NO rotan solas (p. ej. las clonadas); solo se usan si un cliente las elige (campo "voz" de su ficha).
export function vocesExtra() {
  return (process.env.ELEVENLABS_VOICES_EXTRA || '').split(',').map((x) => x.trim()).filter(Boolean).map((x) => { const i = x.indexOf(':'); return i > 0 ? { nombre: x.slice(0, i).trim(), id: x.slice(i + 1).trim() } : { nombre: x.slice(0, 6), id: x }; });
}
// Voz fijada en la ficha del cliente (por nombre, sin importar mayúsculas), si existe en alguna de las dos listas.
function vozDelCliente(campaignId) {
  const camp = db.campaigns.find((x) => x.id === campaignId);
  const nombre = String(db.clients.find((x) => x.id === camp?.clientId)?.voz || '').trim().toLowerCase();
  if (!nombre) return '';
  return [...voces(), ...vocesExtra()].find((v) => v.nombre.toLowerCase() === nombre)?.id || '';
}
// Cada video usa una sola voz (consistente en todas sus escenas); entre videos van rotando.
function elegirVoz(semilla) {
  const l = voces(); if (!l.length) return '';
  const h = crypto.createHash('sha1').update(String(semilla || Math.random())).digest()[0];
  return l[h % l.length].id;
}
export const vozDisponible = () => !!process.env.ELEVENLABS_API_KEY;
const MODELO = () => process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';
// USD por cada 1,000 caracteres (ajústalo con tu plan): ELEVENLABS_USD_POR_1000
const PRECIO = () => Number(process.env.ELEVENLABS_USD_POR_1000 || 0.1);

async function sintetizar(texto, voiceId) {
  const hash = crypto.createHash('sha1').update(`${MODELO()}|${voiceId}|${texto}`).digest('hex').slice(0, 20);
  const f = path.join(DIR, `${hash}.mp3`);
  if (fs.existsSync(f)) return { hash, nuevo: false };
  const r = await fetch(`${API}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text: texto, model_id: MODELO() }),
  });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text().catch(() => '')).slice(0, 160)}`);
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
  return { hash, nuevo: true };
}

// Agrega e.voz (URL) a cada escena con narración. Si falla, el video sigue sin esa voz.
export async function agregarVoz(spec, { campaignId = null, agente = 'video', voiceId = '' } = {}) {
  if (!vozDisponible()) return { usadas: 0, motivo: 'sin llave' };
  const voz = voiceId || vozDelCliente(campaignId) || elegirVoz(campaignId);
  if (!voz) return { usadas: 0, motivo: 'sin voz' };
  let chars = 0, usadas = 0, error = '';
  for (const e of spec.escenas) {
    const txt = (e.narracion || '').trim();
    if (!txt) continue;
    try {
      const { hash, nuevo } = await sintetizar(txt, voz);
      e.voz = `/api/voz/${hash}.mp3`; usadas++;
      if (nuevo) chars += txt.length;
    } catch (err) { error = err.message; console.warn('[voz]', err.message); }
  }
  if (chars) {
    const usd = (chars / 1000) * PRECIO();
    db.usage.push({ t: Date.now(), c: campaignId, a: agente, m: 'elevenlabs', usd, i: chars, o: 0, cr: 0, cw: 0, ws: 0 });
    const c = db.campaigns.find((x) => x.id === campaignId); if (c) c.costo = (c.costo || 0) + usd;
    save();
  }
  return { usadas, chars, error };
}

// Muestra corta de una voz (por nombre) para poder elegirla oyéndola. Se guarda en caché.
export async function muestra(nombre, texto) {
  const v = [...voces(), ...vocesExtra()].find((x) => x.nombre.toLowerCase() === String(nombre || '').toLowerCase());
  if (!v) throw new Error('Esa voz no está en la lista');
  const { hash, nuevo } = await sintetizar(texto, v.id);
  if (nuevo) db.usage.push({ t: Date.now(), c: null, a: 'muestra', m: 'elevenlabs', usd: (texto.length / 1000) * PRECIO(), i: texto.length, o: 0, cr: 0, cw: 0, ws: 0 });
  save();
  return `/api/voz/${hash}.mp3`;
}

export function registrar(app) {
  app.get('/api/voz/lista', (req, res) => res.json({ rotan: voces().map((v) => v.nombre), porCliente: vocesExtra().map((v) => v.nombre) }));
  app.get('/api/voz/muestra', async (req, res) => {
    const texto = String(req.query.texto || 'Hola, soy tu asistente. Cuéntame de tu negocio y te ayudo a atender a tus clientes todo el día.').slice(0, 200);
    try { res.json({ url: await muestra(req.query.nombre, texto) }); } catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.get('/api/voz/:hash.mp3', (req, res) => {
    const f = path.join(DIR, `${req.params.hash.replace(/[^a-f0-9]/g, '')}.mp3`);
    if (!fs.existsSync(f)) return res.status(404).end();
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.type('audio/mpeg').sendFile(f);
  });
  app.get('/api/voz/estado', (req, res) => res.json({ disponible: vozDisponible(), voz: voces().length > 0, voces: voces().map((v) => v.nombre), extra: vocesExtra().map((v) => v.nombre), modelo: MODELO() }));
}

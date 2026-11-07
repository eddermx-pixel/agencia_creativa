// Voz en off con ElevenLabs. Genera un MP3 por escena y lo guarda en disco (se reutiliza si el texto no cambia).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR, db, save } from './store.js';

const API = process.env.ELEVENLABS_API_URL || 'https://api.elevenlabs.io';
const DIR = path.join(DATA_DIR, 'voz');
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
  const voz = voiceId || process.env.ELEVENLABS_VOICE_ID;
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

export function registrar(app) {
  app.get('/api/voz/:hash.mp3', (req, res) => {
    const f = path.join(DIR, `${req.params.hash.replace(/[^a-f0-9]/g, '')}.mp3`);
    if (!fs.existsSync(f)) return res.status(404).end();
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.type('audio/mpeg').sendFile(f);
  });
  app.get('/api/voz/estado', (req, res) => res.json({ disponible: vozDisponible(), voz: !!process.env.ELEVENLABS_VOICE_ID, modelo: MODELO() }));
}

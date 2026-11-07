// Música de fondo generada con ElevenLabs Music. Si falla o no hay llave, el video usa la música sintética.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR, db, save } from './store.js';

const API = process.env.ELEVENLABS_API_URL || 'https://api.elevenlabs.io';
const DIR = path.join(DATA_DIR, 'musica');
const MODELO = () => process.env.ELEVENLABS_MUSIC_MODEL || 'music_v2';
// USD por minuto generado (ajústalo con tu plan): ELEVENLABS_MUSIC_USD_POR_MIN
const PRECIO_MIN = () => Number(process.env.ELEVENLABS_MUSIC_USD_POR_MIN || 0.5);
export const musicaDisponible = () => !!process.env.ELEVENLABS_API_KEY && process.env.MUSICA_IA !== '0';

async function componer(prompt, ms) {
  const hash = crypto.createHash('sha1').update(`${MODELO()}|${ms}|${prompt}`).digest('hex').slice(0, 20);
  const f = path.join(DIR, `${hash}.mp3`);
  if (fs.existsSync(f)) return { hash, nuevo: false };
  const r = await fetch(`${API}/v1/music?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ prompt: `${prompt}. Instrumental, no vocals.`, music_length_ms: ms, model_id: MODELO() }),
  });
  if (!r.ok) throw new Error(`ElevenLabs Music ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
  return { hash, nuevo: true };
}

export async function agregarMusica(spec, { campaignId = null, agente = 'video' } = {}) {
  if (!musicaDisponible() || !spec.musicaPrompt) return { ok: false, motivo: !spec.musicaPrompt ? 'sin prompt' : 'sin llave' };
  const total = spec.escenas.reduce((n, e) => n + e.duracion, 0) + 2;
  const ms = Math.min(600000, Math.max(3000, Math.round(total * 1000)));
  try {
    const { hash, nuevo } = await componer(spec.musicaPrompt, ms);
    spec.musicaUrl = `/api/musica/${hash}.mp3`;
    if (nuevo) {
      const usd = (ms / 60000) * PRECIO_MIN();
      db.usage.push({ t: Date.now(), c: campaignId, a: agente, m: 'elevenlabs-music', usd, i: Math.round(ms / 1000), o: 0, cr: 0, cw: 0, ws: 0 });
      const c = db.campaigns.find((x) => x.id === campaignId); if (c) c.costo = (c.costo || 0) + usd;
      save();
    }
    return { ok: true };
  } catch (e) { console.warn('[musica]', e.message); return { ok: false, error: e.message }; }
}

export function registrar(app) {
  app.get('/api/musica/:hash.mp3', (req, res) => {
    const f = path.join(DIR, `${req.params.hash.replace(/[^a-f0-9]/g, '')}.mp3`);
    if (!fs.existsSync(f)) return res.status(404).end();
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.type('audio/mpeg').sendFile(f);
  });
  // Comprobación: ?probar=1 genera 3 segundos de música (gasta una pizca de tu plan)
  app.get('/api/musica/estado', async (req, res) => {
    const base = { disponible: musicaDisponible(), modelo: MODELO() };
    if (!req.query.probar) return res.json(base);
    const spec = { musicaPrompt: 'short soft instrumental test', escenas: [{ duracion: 1 }] };
    res.json({ ...base, prueba: await agregarMusica(spec) });
  });
}

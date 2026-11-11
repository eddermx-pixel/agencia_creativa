// Efectos de sonido sintetizados con ffmpeg (sin costo, sin internet): se crean una vez y quedan en caché.
// El video los pide por nombre y segundo de inicio; hyperframes.js los mezcla con la voz y la música.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DATA_DIR } from './store.js';

const DIR = path.join(DATA_DIR, 'sfx');
// Cada efecto: expresión de aevalsrc (t = segundos) y duración.
const SFX = {
  whoosh: { d: 0.55, e: '0.5*sin(2*PI*(250*t+2600*t*t))*sin(PI*t/0.55)' },
  whoosh_abajo: { d: 0.55, e: '0.5*sin(2*PI*(2400*t-2200*t*t))*sin(PI*t/0.55)' },
  pop: { d: 0.18, e: '0.9*sin(2*PI*(1000-3500*t)*t)*exp(-28*t)' },
  clic: { d: 0.06, e: '0.8*(random(0)*2-1)*exp(-160*t)' },
  teclas: { d: 0.9, e: '0.55*(random(0)*2-1)*exp(-260*mod(t,0.1))*lt(mod(t,0.1),0.04)' },
  ding: { d: 1.1, e: '0.5*(sin(2*PI*1320*t)+0.45*sin(2*PI*1980*t))*exp(-5*t)' },
  notificacion: { d: 0.7, e: '0.55*exp(-8*if(lt(t,0.12),t,t-0.12))*sin(2*PI*if(lt(t,0.12),988,1319)*t)' },
  impacto: { d: 1.0, e: '0.95*sin(2*PI*(95-60*t)*t)*exp(-4.5*t)+0.35*(random(0)*2-1)*exp(-18*t)' },
  exito: { d: 0.9, e: '0.5*exp(-4*t)*(sin(2*PI*if(lt(t,0.12),784,if(lt(t,0.24),988,1319))*t))' },
};
export const TIPOS = Object.keys(SFX);

function ffmpeg(args) {
  return new Promise((ok, fail) => {
    const p = spawn('ffmpeg', ['-y', '-loglevel', 'error', ...args]); let err = '';
    p.stderr.on('data', (d) => (err = (err + d).slice(-300)));
    p.on('error', fail); p.on('exit', (c) => (c === 0 ? ok() : fail(new Error(err))));
  });
}

// Devuelve la ruta del WAV del efecto (lo crea si no existe).
export async function archivoEfecto(tipo) {
  const s = SFX[tipo]; if (!s) throw new Error(`Efecto desconocido "${tipo}". Disponibles: ${TIPOS.join(', ')}`);
  const f = path.join(DIR, `${tipo}.wav`);
  if (fs.existsSync(f)) return f;
  fs.mkdirSync(DIR, { recursive: true });
  await ffmpeg(['-f', 'lavfi', '-i', `aevalsrc='${s.e}':d=${s.d}:s=44100`, '-af', 'highpass=f=60,alimiter=limit=0.9', f]);
  return f;
}

// lista: [{tipo, inicio, volumen?}] → [{archivo, inicio, vol}] (los que fallan se omiten)
export async function prepararEfectos(lista = []) {
  const out = [];
  for (const x of (lista || []).slice(0, 40)) {
    try { out.push({ archivo: await archivoEfecto(String(x.tipo)), inicio: Math.max(0, +x.inicio || 0), vol: Math.min(1.5, Math.max(0.1, +x.volumen || 0.7)) }); }
    catch (e) { console.warn('[efectos]', e.message); }
  }
  return out;
}

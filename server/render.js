// Render en el servidor: abre el reproductor en un Chromium sin pantalla, graba el video con voz,
// música y efectos, y lo convierte a MP4 con ffmpeg. Se guarda en "Resultado final" del cliente.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { db, save, DATA_DIR } from './store.js';
import { bus, log } from './hub.js';
import * as files from './files.js';
import * as entregables from './entregables.js';
import { baseNombre } from './nombres.js';
import { conTurno } from './pesado.js';

const CANDIDATOS = [process.env.CHROMIUM_PATH, '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/opt/pw-browsers/chromium-1243/chrome-linux/chrome'].filter(Boolean);
const chromePath = () => CANDIDATOS.find((p) => fs.existsSync(p));
const TMP = path.join(DATA_DIR, 'tmp-render');
let ffmpegOk = null;
const tieneFfmpeg = () => new Promise((ok) => { if (ffmpegOk !== null) return ok(ffmpegOk); const p = spawn('ffmpeg', ['-version']); p.on('error', () => ok((ffmpegOk = false))); p.on('exit', (c) => ok((ffmpegOk = c === 0))); });

export async function renderDisponible() {
  if (!chromePath()) return { ok: false, motivo: 'No hay Chromium en el servidor (se necesita el Dockerfile del proyecto).' };
  if (!(await tieneFfmpeg())) return { ok: false, motivo: 'No hay ffmpeg en el servidor.' };
  return { ok: true };
}

function aMp4(entrada, salida) {
  return new Promise((ok, fail) => {
    const p = spawn('ffmpeg', ['-y', '-i', entrada, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', salida]);
    let err = ''; p.stderr.on('data', (d) => (err = (err + d).slice(-600)));
    p.on('error', fail); p.on('exit', (c) => (c === 0 ? ok() : fail(new Error(`ffmpeg: ${err.slice(-200)}`))));
  });
}

async function renderizar(p, puerto) {
  const { chromium } = await import('playwright-core');
  const durMax = (JSON.parse(p.contenido).escenas || []).reduce((n, e) => n + (e.duracion || 0), 0) + 6;
  const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 540, height: 960 }, extraHTTPHeaders: process.env.ACCESS_KEY ? { 'x-access-key': process.env.ACCESS_KEY } : {} });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(`http://127.0.0.1:${puerto}/player.html?id=${encodeURIComponent(p.id)}&embed=1&render=1`);
    await page.waitForFunction(() => window.__renderDone, null, { timeout: Math.max(120, durMax * 6) * 1000 });
    const r = await page.evaluate(() => window.__renderDone);
    if (!r.ok) throw new Error(r.error || errs[0] || 'No se pudo grabar el video');
  } finally { await browser.close().catch(() => {}); }
}

// Cola de un render a la vez (Chromium consume mucha memoria)
const cola = []; let corriendo = false; let PUERTO = 3000;
export function iniciarRender(puerto) { PUERTO = puerto; }
export async function encolar(p, motivo = 'manual') {
  const d = await renderDisponible();
  if (!d.ok) throw new Error(d.motivo);
  if (p.render?.estado === 'en_cola' || p.render?.estado === 'grabando') return p.render;
  p.render = { estado: 'en_cola', desde: Date.now(), motivo }; save(); bus.emit('piece', p);
  cola.push(p.id); siguiente();
  return p.render;
}
async function siguiente() {
  if (corriendo) return; const id = cola.shift(); if (!id) return;
  corriendo = true;
  const p = db.pieces.find((x) => x.id === id);
  try {
    p.render = { ...p.render, estado: 'grabando' }; save(); bus.emit('piece', p);
    fs.mkdirSync(TMP, { recursive: true });
    await conTurno(() => renderizar(p, PUERTO));
    const crudo = fs.readdirSync(TMP).find((f) => f.startsWith(`${p.id}.`));
    if (!crudo) throw new Error('El navegador no entregó el video.');
    const donde = entregables.carpetaPieza(p);
    if (!donde) throw new Error('La pieza no tiene cliente asignado.');
    files.ensureFolders(donde.clientId);
    const rel = `${files.FINAL}/${donde.sub}/${baseNombre(p)}.mp4`;
    const { full } = files.safePath(donde.clientId, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    await aMp4(path.join(TMP, crudo), full);
    fs.unlinkSync(path.join(TMP, crudo));
    p.mediaRuta = rel; p.render = { estado: 'listo', ruta: rel, listo: Date.now(), mb: Math.round((fs.statSync(full).size / 1e6) * 10) / 10 };
    log('director', `🎞️ MP4 listo: "${p.titulo}" (${p.render.mb} MB) en ${rel}`, p.campaignId);
    bus.emit('files', { clientId: donde.clientId });
  } catch (e) {
    p.render = { estado: 'error', error: e.message.slice(0, 200) };
    log('director', `⚠️ No se pudo renderizar "${p.titulo}": ${e.message.slice(0, 140)}`, p.campaignId);
  }
  save(); bus.emit('piece', p);
  corriendo = false; siguiente();
}

export function registrar(app, express) {
  app.get('/api/render/estado', async (req, res) => res.json(await renderDisponible()));
  app.post('/api/pieces/:id/render', async (req, res) => {
    const p = db.pieces.find((x) => x.id === req.params.id);
    if (!p || p.motor !== 'v2') return res.status(404).json({ error: 'Solo los videos del motor v2 se renderizan aquí.' });
    try { res.json(await encolar(p, 'manual')); } catch (e) { res.status(400).json({ error: e.message }); }
  });
  // El navegador sin pantalla sube aquí el video grabado
  app.put('/api/pieces/:id/render-upload', (req, res) => {
    const p = db.pieces.find((x) => x.id === req.params.id);
    if (!p) return res.status(404).json({ error: 'No existe' });
    fs.mkdirSync(TMP, { recursive: true });
    const ext = ['mp4', 'webm'].includes(req.query.ext) ? req.query.ext : 'webm';
    const out = fs.createWriteStream(path.join(TMP, `${p.id}.${ext}`));
    req.pipe(out); out.on('finish', () => res.json({ ok: true })); out.on('error', (e) => res.status(500).json({ error: e.message }));
  });
  // Al aprobar un video, se renderiza solo (si el servidor puede)
  bus.on('piece', (p) => {
    if (p.estado === 'aprobada' && p.motor === 'v2' && !p.render && process.env.RENDER_AUTO !== '0') encolar(p, 'aprobada').catch(() => {});
  });
}

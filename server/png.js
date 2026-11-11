// Artes finales en PNG 1080×1350, hechos en el servidor con Chromium (el mismo del render de video).
// El SVG sigue guardándose como fuente editable; el PNG es lo que se sube a redes.
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { conTurno } from './pesado.js';

const CANDIDATOS = [process.env.CHROMIUM_PATH, '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/opt/pw-browsers/chromium-1243/chrome-linux/chrome'].filter(Boolean);
const chromePath = () => CANDIDATOS.find((p) => fs.existsSync(p));
export const pngDisponible = () => !!chromePath();

// Tamaño del SVG (viewBox o width/height); por defecto 1080×1350.
export function dimensiones(svg) {
  const vb = /viewBox=["']\s*[-\d.]+[ ,]+[-\d.]+[ ,]+([\d.]+)[ ,]+([\d.]+)/i.exec(svg);
  if (vb) return [Math.round(+vb[1]), Math.round(+vb[2])];
  const w = /<svg[^>]*\swidth=["']([\d.]+)(?:px)?["']/i.exec(svg), h = /<svg[^>]*\sheight=["']([\d.]+)(?:px)?["']/i.exec(svg);
  return w && h ? [Math.round(+w[1]), Math.round(+h[1])] : [1080, 1350];
}

// svg: texto del SVG ya con el logo. Devuelve un Buffer PNG o lanza Error.
export function svgAPng(svg, w, h) {
  if (!w || !h) [w, h] = dimensiones(svg);
  if (!chromePath()) throw new Error('No hay Chromium en el servidor para crear el PNG.');
  return conTurno(async () => {
    const { chromium } = await import('playwright-core');
    const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    try {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      await page.setContent(`<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#fff}svg{display:block;width:${w}px;height:${h}px}</style>${svg}`, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts?.ready);
      return await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: w, height: h } });
    } finally { await browser.close().catch(() => {}); }
  });
}

// JPG listo para subir (calidad alta, fondo blanco) a partir de un PNG ya hecho.
export function pngAJpg(png) {
  return new Promise((ok, fail) => {
    const p = spawn('ffmpeg', ['-loglevel', 'error', '-i', 'pipe:0', '-q:v', '2', '-pix_fmt', 'yuvj420p', '-f', 'mjpeg', 'pipe:1']);
    const out = []; let err = '';
    p.stdout.on('data', (d) => out.push(d)); p.stderr.on('data', (d) => (err = (err + d).slice(-300)));
    p.on('error', fail); p.on('exit', (c) => (c === 0 ? ok(Buffer.concat(out)) : fail(new Error(`ffmpeg: ${err}`))));
    p.stdin.on('error', () => {}); p.stdin.end(png);
  });
}
export async function svgAJpg(svg) { return pngAJpg(await svgAPng(svg)); }

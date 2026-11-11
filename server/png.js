// Artes finales en PNG 1080×1350, hechos en el servidor con Chromium (el mismo del render de video).
// El SVG sigue guardándose como fuente editable; el PNG es lo que se sube a redes.
import fs from 'node:fs';
import { conTurno } from './pesado.js';

const CANDIDATOS = [process.env.CHROMIUM_PATH, '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/opt/pw-browsers/chromium-1243/chrome-linux/chrome'].filter(Boolean);
const chromePath = () => CANDIDATOS.find((p) => fs.existsSync(p));
export const pngDisponible = () => !!chromePath();

// svg: texto del SVG ya con el logo. Devuelve un Buffer PNG o lanza Error.
export function svgAPng(svg, w = 1080, h = 1350) {
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

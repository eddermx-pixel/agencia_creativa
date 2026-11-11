// Archivos FINALES listos para usar de cada pieza: MP4 (video), JPG/PNG (arte) o TXT (texto).
// Los SVG, JSON y HTML son solo fuentes editables: no son lo que se sube a redes.
import fs from 'node:fs';
import { db } from './store.js';
import * as files from './files.js';
import { baseNombre } from './nombres.js';
import { rutaFinal as rutaFinalHF } from './hyperframes.js';
import { svgAPng, svgAJpg } from './png.js';

export { baseNombre };

// Ruta absoluta del MP4 de un video (hf o v2 ya renderizado), o null.
export function rutaVideo(p) {
  try {
    if (p.motor === 'hf') { const f = rutaFinalHF(JSON.parse(p.contenido).clave); return fs.existsSync(f) ? f : null; }
    if (p.mediaRuta) {
      const camp = db.campaigns.find((x) => x.id === p.campaignId);
      if (camp?.clientId) { const { full } = files.safePath(camp.clientId, p.mediaRuta); return fs.existsSync(full) ? full : null; }
    }
  } catch {}
  return null;
}

// Lista de archivos finales de la pieza para el ZIP: [{ name, data: Buffer|string }] (los videos aún sin MP4 se omiten y se avisa)
export async function paraZip(p, cuerpoSvg) {
  const b = baseNombre(p); const out = []; const faltan = [];
  if (p.propuesta) return { out, faltan };
  if (p.tipo === 'texto') out.push({ name: `${b}.txt`, data: p.contenido });
  else if (p.tipo === 'arte') {
    try { out.push({ name: `${b}.jpg`, data: await svgAJpg(cuerpoSvg) }, { name: `${b}.png`, data: await svgAPng(cuerpoSvg) }); }
    catch { faltan.push(`${b}: no se pudo crear el JPG/PNG en este servidor`); }
    out.push({ name: `fuentes/${b}.svg`, data: cuerpoSvg });
  } else if (p.tipo === 'video') {
    const f = rutaVideo(p);
    if (f) out.push({ name: `${b}.mp4`, data: fs.readFileSync(f) }); else faltan.push(`${b}: el MP4 aún no está listo`);
    if (p.motor === 'v2') out.push({ name: `fuentes/${b}.json`, data: p.contenido });
  }
  return { out, faltan };
}

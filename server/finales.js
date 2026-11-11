// Archivos FINALES listos para usar de cada pieza: MP4 (video), JPG/PNG (arte) o TXT (texto).
// Los SVG, JSON y HTML son solo fuentes editables: no son lo que se sube a redes.
import fs from 'node:fs';
import path from 'node:path';
import { db, save } from './store.js';
import * as files from './files.js';
import { baseNombre } from './nombres.js';
import { rutaFinal as rutaFinalHF } from './hyperframes.js';
import { svgAPng, pngAJpg } from './png.js';
import * as entregables from './entregables.js';

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

// Ruta absoluta de un archivo ya guardado en la carpeta del cliente (p[campo] = ruta relativa), o null.
function guardado(p, campo) {
  try {
    const camp = db.campaigns.find((x) => x.id === p.campaignId);
    if (!camp?.clientId || !p[campo]) return null;
    const { full } = files.safePath(camp.clientId, p[campo]);
    return fs.existsSync(full) ? full : null;
  } catch { return null; }
}
const conTiempo = (promesa, ms) => Promise.race([promesa, new Promise((_, no) => setTimeout(() => no(new Error('tardó demasiado')), ms))]);

// Entradas del ZIP para una pieza: [{ name, ruta | data }]. Los videos y artes ya guardados se leen del disco en flujo (no se cargan en memoria);
// un arte sin JPG/PNG guardado se genera UNA vez (con tope de tiempo) y se guarda para las siguientes descargas.
export async function paraZip(p, cuerpoSvg) {
  const b = baseNombre(p); const out = []; const faltan = [];
  if (p.propuesta) return { out, faltan };
  if (p.tipo === 'texto') out.push({ name: `${b}.txt`, data: p.contenido });
  else if (p.tipo === 'arte') {
    let j = guardado(p, 'jpgRuta'), n = guardado(p, 'pngRuta');
    if (!j || !n) {
      try {
        const png = await conTiempo(svgAPng(cuerpoSvg), 30000); const jpg = await pngAJpg(png);
        const camp = db.campaigns.find((x) => x.id === p.campaignId);
        if (camp?.clientId) {
          const base = `${entregables.carpetaEntregables(camp)}/${b}`;
          files.ensureFolders(camp.clientId);
          const fpng = files.safePath(camp.clientId, `${base}.png`).full; fs.mkdirSync(path.dirname(fpng), { recursive: true });
          fs.writeFileSync(fpng, png); fs.writeFileSync(files.safePath(camp.clientId, `${base}.jpg`).full, jpg);
          p.pngRuta = `${base}.png`; p.jpgRuta = `${base}.jpg`; save();
        }
        out.push({ name: `${b}.jpg`, data: jpg }, { name: `${b}.png`, data: png });
      } catch (e) { faltan.push(`${b}: no se pudo crear el JPG/PNG (${e.message})`); }
    } else out.push({ name: `${b}.jpg`, ruta: j }, { name: `${b}.png`, ruta: n });
    out.push({ name: `fuentes/${b}.svg`, data: cuerpoSvg });
  } else if (p.tipo === 'video') {
    const f = rutaVideo(p);
    if (f) out.push({ name: `${b}.mp4`, ruta: f }); else faltan.push(`${b}: el MP4 aún no está listo`);
    if (p.motor === 'v2') out.push({ name: `fuentes/${b}.json`, data: p.contenido });
  }
  return { out, faltan };
}

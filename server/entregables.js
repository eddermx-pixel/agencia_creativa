// Cuando apruebas una pieza, se guarda sola en el archivo del cliente:
//   /data/clientes/<cliente>/Resultado final/<fecha> <campaña>/<pieza>.<ext>
// y se anota en la carpeta compartida de los agentes.
import fs from 'node:fs';
import path from 'node:path';
import { db, save, DATA_DIR } from './store.js';
import * as files from './files.js';
import * as ws from './workspace.js';
import { svgAPng, svgAJpg, pngDisponible } from './png.js';
import { baseNombre } from './nombres.js';

const slug = ws.slug;
const EXT = { arte: 'svg', video: 'html', texto: 'txt' };
export const extDe = (p) => (p.motor === 'hf' ? 'mp4' : p.motor === 'v2' ? 'json' : EXT[p.tipo] || 'txt');
export const nombreArchivo = (p) => `${baseNombre(p)}.${extDe(p)}`;
export function cuerpo(p) {
  if (p.tipo === 'texto') return p.contenido;
  const camp = db.campaigns.find((x) => x.id === p.campaignId);
  const logo = db.clients.find((x) => x.id === camp?.clientId)?.logo || '';
  return p.contenido.replaceAll('{{LOGO}}', logo);
}

export function carpetaEntregables(camp) { return `${files.FINAL}/${ws.carpetaCampana(camp)}`; }

// Guarda la pieza aprobada. Devuelve la ruta dentro del cliente.
export function guardar(p) {
  if (p.propuesta) return null; // las propuestas visuales no van a "Resultado final"
  const camp = db.campaigns.find((x) => x.id === p.campaignId);
  if (!camp?.clientId) return null;
  try {
    files.ensureFolders(camp.clientId);
    const rel = `${carpetaEntregables(camp)}/${nombreArchivo(p)}`;
    const { full } = files.safePath(camp.clientId, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    let relFinal = rel; // lo que se anota como el archivo final de la pieza
    if (p.motor === 'hf') {
      const { clave } = JSON.parse(p.contenido);
      const src = path.join(DATA_DIR, 'hf', String(clave).replace(/[^a-zA-Z0-9_-]/g, ''), 'final.mp4');
      fs.copyFileSync(src, full);
      p.mediaRuta = rel;
    } else if (p.tipo === 'arte') {
      // Lo final es JPG y PNG listos para subir; el SVG queda como fuente editable en "Material en crudo".
      const base = rel.replace(/\.svg$/i, ''); relFinal = `${base}.jpg`;
      const fuente = files.safePath(camp.clientId, `${files.CRUDO}/${ws.carpetaCampana(camp)}/${path.basename(base)}.svg`).full;
      fs.mkdirSync(path.dirname(fuente), { recursive: true });
      fs.writeFileSync(fuente, cuerpo(p));
      if (pngDisponible()) {
        const svg = cuerpo(p);
        Promise.all([svgAPng(svg), svgAJpg(svg)]).then(([png, jpg]) => {
          fs.writeFileSync(files.safePath(camp.clientId, `${base}.png`).full, png);
          fs.writeFileSync(files.safePath(camp.clientId, `${base}.jpg`).full, jpg);
          p.jpgRuta = `${base}.jpg`; p.pngRuta = `${base}.png`; save();
        }).catch((e) => console.warn('[final jpg/png]', e.message));
      }
    } else if (p.motor === 'v2') {
      relFinal = `${path.dirname(rel)}/${baseNombre(p)}.mp4`;
      // El guion JSON es solo la fuente; el MP4 lo crea el render del servidor (render.js) en esta misma carpeta.
      const fuente = files.safePath(camp.clientId, `${files.CRUDO}/${ws.carpetaCampana(camp)}/${path.basename(rel)}`).full;
      fs.mkdirSync(path.dirname(fuente), { recursive: true });
      fs.writeFileSync(fuente, cuerpo(p));
    } else fs.writeFileSync(full, cuerpo(p));
    ws.piezaAprobada(camp, p, relFinal);
    ws.concepto(camp);
    save();
    return relFinal;
  } catch (e) { console.warn('[entregables]', e.message); return null; }
}

export function carpetaPieza(p) {
  const camp = db.campaigns.find((x) => x.id === p.campaignId);
  return camp?.clientId ? { camp, clientId: camp.clientId, sub: ws.carpetaCampana(camp) } : null;
}

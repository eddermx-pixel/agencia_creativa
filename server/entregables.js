// Cuando apruebas una pieza, se guarda sola en el archivo del cliente:
//   /data/clientes/<cliente>/Resultado final/<fecha> <campaña>/<pieza>.<ext>
// y se anota en la carpeta compartida de los agentes.
import fs from 'node:fs';
import path from 'node:path';
import { db, save, DATA_DIR } from './store.js';
import * as files from './files.js';
import * as ws from './workspace.js';

const slug = ws.slug;
const EXT = { arte: 'svg', video: 'html', texto: 'txt' };
export const extDe = (p) => (p.motor === 'hf' ? 'mp4' : p.motor === 'v2' ? 'json' : EXT[p.tipo] || 'txt');
export const nombreArchivo = (p) => { const b = slug(p.titulo) || 'pieza'; return `${/[\s-]v\d+$/i.test(b) ? b : `${b}-v${p.version || 1}`}.${extDe(p)}`; };
export function cuerpo(p) {
  if (p.tipo === 'texto') return p.contenido;
  const camp = db.campaigns.find((x) => x.id === p.campaignId);
  const logo = db.clients.find((x) => x.id === camp?.clientId)?.logo || '';
  return p.contenido.replaceAll('{{LOGO}}', logo);
}

export function carpetaEntregables(camp) { return `${files.FINAL}/${ws.carpetaCampana(camp)}`; }

// Guarda la pieza aprobada. Devuelve la ruta dentro del cliente.
export function guardar(p) {
  const camp = db.campaigns.find((x) => x.id === p.campaignId);
  if (!camp?.clientId) return null;
  try {
    files.ensureFolders(camp.clientId);
    const rel = `${carpetaEntregables(camp)}/${nombreArchivo(p)}`;
    const { full } = files.safePath(camp.clientId, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    if (p.motor === 'hf') {
      const { clave } = JSON.parse(p.contenido);
      const src = path.join(DATA_DIR, 'hf', String(clave).replace(/[^a-zA-Z0-9_-]/g, ''), 'final.mp4');
      fs.copyFileSync(src, full);
      p.mediaRuta = rel;
    } else fs.writeFileSync(full, cuerpo(p));
    ws.piezaAprobada(camp, p, rel);
    ws.concepto(camp);
    save();
    return rel;
  } catch (e) { console.warn('[entregables]', e.message); return null; }
}

export function carpetaPieza(p) {
  const camp = db.campaigns.find((x) => x.id === p.campaignId);
  return camp?.clientId ? { camp, clientId: camp.clientId, sub: ws.carpetaCampana(camp) } : null;
}

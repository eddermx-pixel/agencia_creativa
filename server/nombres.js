// Nombre ÚNICO de archivo para cada pieza: Cliente_AAAA-MM-DD_Titulo_vN_xxxxx
// (antes dos piezas con el mismo título y versión se llamaban igual y una descarga pisaba a la otra).
import { db } from './store.js';

const limpio = (s, n) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, n).replace(/-+$/, '');
export const fechaLocal = (t) => new Date(t).toLocaleDateString('sv-SE'); // AAAA-MM-DD en hora local

export function baseNombre(p) {
  const camp = db.campaigns.find((c) => c.id === p.campaignId);
  const cliente = limpio(camp?.cliente, 18) || 'Sin-cliente';
  const titulo = limpio(String(p.titulo || '').replace(/^Propuesta visual\s*·\s*/i, 'Propuesta '), 42) || 'pieza';
  return `${cliente}_${fechaLocal(p.juzgada || p.creada)}_${titulo}_v${p.version || 1}_${String(p.id).replace(/^p_/, '').slice(-5)}`;
}
export const carpetaZip = (c) => `${limpio(c.cliente, 30) || 'Sin-cliente'}/${fechaLocal(c.creada)} ${limpio(c.brief, 30) || 'campana'}`;

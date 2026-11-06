// "Computadora" de cada agente: una carpeta en disco con sus notas, tareas, entregas,
// investigación y apuntes. Hay además una carpeta COMPARTIDA por campaña (brief, respuestas,
// concepto y piezas aprobadas) que todos los agentes y el jefe pueden leer.
//
//   /data/espacios/<agente>/        → lo suyo (notas/, tareas/, entregas/, juntas/, cursos/, resultados/)
//   /data/espacios/compartido/<campaña>/  → lo de todos
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './store.js';
import { ROSTER } from './roster.js';

const ROOT = path.join(DATA_DIR, 'espacios');
export const COMPARTIDO = 'compartido';
// Acepta el id interno (video) o el nombre del personaje (Max)
export const espacioId = (x) => { const v = String(x || '').trim().toLowerCase(); return ROSTER.find((r) => r.id === v || r.nombre.toLowerCase() === v)?.id || v; };
export const ES_ESPACIO = (id) => id === COMPARTIDO || ROSTER.some((a) => a.id === espacioId(id));
const TEXTO = /\.(md|txt|json|csv|html|svg)$/i;
const limpio = (s) => String(s || '').normalize('NFC').replace(/[\\/:*?"<>|\x00-\x1f]/g, '').replace(/\.\.+/g, '.').replace(/^\.+/, '').trim().slice(0, 80);
export const slug = (s) => limpio(s).replace(/\s+/g, ' ');

function resolver(espacio, rel) {
  espacio = espacioId(espacio);
  if (!ES_ESPACIO(espacio)) throw new Error('Espacio inexistente');
  const partes = String(rel || '').split('/').map(limpio).filter(Boolean);
  if (!partes.length || partes.length > 3) throw new Error('Ruta no válida');
  const base = path.join(ROOT, espacio);
  const full = path.join(base, ...partes);
  if (!full.startsWith(base + path.sep)) throw new Error('Ruta no válida');
  return { full, partes };
}

export function escribir(espacio, rel, contenido) {
  const { full, partes } = resolver(espacio, rel);
  if (!TEXTO.test(partes.at(-1))) throw new Error('Solo se guardan archivos de texto (.md, .txt, .json, .csv, .html, .svg)');
  const data = Buffer.from(String(contenido), 'utf8');
  if (data.length > 600 * 1024) throw new Error('El archivo es demasiado grande (máx. 600 KB)');
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, data);
  return partes.join('/');
}

export function agregar(espacio, rel, texto) {
  const { full } = resolver(espacio, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.appendFileSync(full, String(texto));
}

export function leer(espacio, rel, max = 120_000) {
  const { full, partes } = resolver(espacio, rel);
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) throw new Error('No existe ese archivo');
  if (!TEXTO.test(partes.at(-1))) throw new Error('Solo se pueden leer archivos de texto');
  const t = fs.readFileSync(full, 'utf8');
  return t.length > max ? `${t.slice(0, max)}\n… (recortado)` : t;
}

export function enviar(res, espacio, rel) {
  const { full, partes } = resolver(espacio, rel);
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return res.status(404).end();
  res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const ext = path.extname(partes.at(-1)).slice(1).toLowerCase();
  res.type({ svg: 'image/svg+xml', html: 'text/plain; charset=utf-8', json: 'application/json', md: 'text/plain; charset=utf-8', txt: 'text/plain; charset=utf-8', csv: 'text/csv; charset=utf-8' }[ext] || 'text/plain');
  if (res.req?.query?.descargar) res.setHeader('Content-Disposition', `attachment; filename="${partes.at(-1)}"`);
  res.sendFile(full);
}

const arch = (dir, pre) => fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isFile() && !d.name.startsWith('.')).map((d) => {
  const st = fs.statSync(path.join(dir, d.name));
  return { nombre: d.name, ruta: `${pre}/${d.name}`, tam: st.size, mod: st.mtimeMs, texto: TEXTO.test(d.name) };
}).sort((a, b) => b.mod - a.mod);

// Árbol: carpetas (1 nivel) → archivos y subcarpetas (1 nivel más)
export function listar(espacio) {
  espacio = espacioId(espacio);
  if (!ES_ESPACIO(espacio)) throw new Error('Espacio inexistente');
  const base = path.join(ROOT, espacio);
  if (!fs.existsSync(base)) return [];
  const out = [{ carpeta: '', archivos: [], subcarpetas: [] }];
  for (const d of fs.readdirSync(base, { withFileTypes: true })) {
    if (d.isFile() && !d.name.startsWith('.')) { const st = fs.statSync(path.join(base, d.name)); out[0].archivos.push({ nombre: d.name, ruta: d.name, tam: st.size, mod: st.mtimeMs, texto: TEXTO.test(d.name) }); continue; }
    if (!d.isDirectory()) continue;
    const dir = path.join(base, d.name);
    out.push({ carpeta: d.name, archivos: arch(dir, d.name), subcarpetas: fs.readdirSync(dir, { withFileTypes: true }).filter((x) => x.isDirectory()).map((x) => ({ nombre: x.name, archivos: arch(path.join(dir, x.name), `${d.name}/${x.name}`) })) });
  }
  return out.filter((c) => c.carpeta || c.archivos.length);
}

export function resumenListado(espacio) {
  const t = listar(espacio);
  if (!t.length) return '(vacío)';
  return t.map((c) => {
    const todos = [...c.archivos, ...c.subcarpetas.flatMap((s) => s.archivos)];
    return `${c.carpeta || '(raíz)'}: ${todos.length ? todos.slice(0, 25).map((a) => a.ruta).join(', ') : '(vacía)'}`;
  }).join('\n');
}

// ---- Lo que se guarda solo ----
const fechaCorta = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
export const carpetaCampana = (c) => {
  if (!c.carpetaNombre) c.carpetaNombre = slug(`${fechaCorta(c.creada)} ${c.brief.split(/\s+/).slice(0, 5).join(' ') || c.cliente}`);
  return c.carpetaNombre;
};

export function brief(c) {
  escribir(COMPARTIDO, `${carpetaCampana(c)}/brief.md`, `# Campaña de ${c.cliente}\n\nFecha: ${fechaCorta(c.creada)}\n\n## Brief del jefe\n\n${c.brief}\n`);
}
export function respuestas(c, texto) {
  escribir(COMPARTIDO, `${carpetaCampana(c)}/respuestas-del-jefe.md`, `# Respuestas del jefe al cuestionario\n\n${texto}\n`);
}
export function concepto(c) {
  if (!c.concepto) return;
  escribir(COMPARTIDO, `${carpetaCampana(c)}/concepto-aprobado.md`, `# Concepto aprobado: ${c.concepto.titulo}\n\n${c.concepto.detalle}\n`);
}
export function piezaAprobada(c, p, nombreArchivo) {
  agregar(COMPARTIDO, `${carpetaCampana(c)}/piezas-aprobadas.md`, `- [${p.tipo}] **${p.titulo}** (v${p.version || 1}, por ${p.agente}) → ${nombreArchivo}${p.comentario ? ` — comentario del jefe: ${p.comentario}` : ''}\n`);
}
export function tareaActual(agentId, job, campana, texto) {
  escribir(agentId, 'tareas/tarea-actual.md', `# Tarea actual · ${campana}\n\n${job.task}\n\n## Estado\n\n${texto || 'En curso'}\n\n*Actualizado: ${new Date().toLocaleString('es-MX')}*\n`);
}
export function resultado(agentId, campanaNombre, texto) {
  escribir(agentId, `resultados/${slug(`${fechaCorta()} ${campanaNombre}`)}.md`, `# Resultado · ${campanaNombre}\n\n${texto}\n`);
}
export function entrega(agentId, c, p, contenido, ext) {
  escribir(agentId, `entregas/${slug(`${carpetaCampana(c)} ${p.titulo}-v${p.version || 1}`)}.${ext}`, contenido);
}
export function junta(agentId, m, texto) {
  escribir(agentId, `juntas/junta-${m.numero}-${fechaCorta(m.creada)}.md`, `# Junta creativa #${m.numero}\n\n**Tema:** ${m.tema}\n\n## Mi aporte\n\n${texto}\n`);
}
export function curso(agentId, c) {
  escribir(agentId, `cursos/${slug(c.tema)}.md`, `# Curso: ${c.tema}\n\n${(c.apuntes || []).map((x) => `- ${x}`).join('\n')}\n\n## Habilidades nuevas\n\n${(c.skills || []).map((s) => `- ${s.nombre} (${s.nivel})`).join('\n') || '—'}\n\n## Fuentes\n\n${(c.fuentes || []).join('\n') || '—'}\n`);
}

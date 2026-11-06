// Archivos de cada cliente en el disco (/data en Railway), ordenados en carpetas
// fijas con un solo nivel de subcarpetas: así nunca se vuelve un desorden.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './store.js';

export const CARPETAS = ['Logos', 'Referencias visuales', 'Estilo de video', 'Fotos y videos de producto', 'Documentos'];
export const AYUDA = {
  'Logos': 'Logo en PNG o SVG (de preferencia con fondo transparente) y variantes.',
  'Referencias visuales': 'Diseños, posts o marcas que te gustan: colores, composición, tipografía.',
  'Estilo de video': 'Videos o capturas con el estilo de edición que buscas (ritmo, transiciones, subtítulos).',
  'Fotos y videos de producto': 'Material propio para usar en las piezas: producto, local, equipo.',
  'Documentos': 'Manual de marca, catálogo, precios, presentaciones.',
};
const EXT_OK = /\.(png|jpe?g|webp|gif|svg|heic|mp4|mov|webm|m4v|pdf|docx?|pptx?|xlsx?|txt|csv|ttf|otf|woff2?|ai|psd|zip)$/i;
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', heic: 'image/heic', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', m4v: 'video/mp4', pdf: 'application/pdf', txt: 'text/plain; charset=utf-8', csv: 'text/csv; charset=utf-8' };
export const MAX_BYTES = 250 * 1024 * 1024;

const ROOT = path.join(DATA_DIR, 'clientes');
const limpio = (s) => String(s || '').normalize('NFC').replace(/[\\/:*?"<>|\x00-\x1f]/g, '').replace(/\.\.+/g, '.').replace(/^\.+/, '').trim().slice(0, 80);
export const clientDir = (id) => path.join(ROOT, limpio(id));

// Convierte "Carpeta/Sub/archivo.ext" en una ruta segura dentro del cliente.
export function safePath(clientId, rel) {
  const partes = String(rel || '').split('/').map(limpio).filter(Boolean);
  if (!partes.length || !CARPETAS.includes(partes[0]) || partes.length > 3) throw new Error('Ruta no válida');
  const full = path.join(clientDir(clientId), ...partes);
  if (!full.startsWith(clientDir(clientId) + path.sep)) throw new Error('Ruta no válida');
  return { full, partes };
}

export function ensureFolders(clientId) {
  for (const c of CARPETAS) fs.mkdirSync(path.join(clientDir(clientId), c), { recursive: true });
}

const tipoDe = (n) => (/\.(png|jpe?g|webp|gif|svg|heic)$/i.test(n) ? 'imagen' : /\.(mp4|mov|webm|m4v)$/i.test(n) ? 'video' : /\.pdf$/i.test(n) ? 'pdf' : 'archivo');
const leerArchivos = (dir, prefijo) => fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isFile()).map((d) => {
  const st = fs.statSync(path.join(dir, d.name));
  return { nombre: d.name, ruta: `${prefijo}/${d.name}`, tam: st.size, tipo: tipoDe(d.name), mod: st.mtimeMs };
}).sort((a, b) => b.mod - a.mod);

export function listar(clientId) {
  ensureFolders(clientId);
  return CARPETAS.map((c) => {
    const dir = path.join(clientDir(clientId), c);
    const subs = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => ({ nombre: d.name, archivos: leerArchivos(path.join(dir, d.name), `${c}/${d.name}`) }));
    return { carpeta: c, ayuda: AYUDA[c], archivos: leerArchivos(dir, c), subcarpetas: subs };
  });
}

export function nombreLibre(dir, nombre) {
  let n = limpio(nombre) || 'archivo';
  if (!EXT_OK.test(n)) throw new Error('Tipo de archivo no permitido (imágenes, videos, PDF, documentos o fuentes).');
  const ext = path.extname(n); const base = n.slice(0, -ext.length);
  for (let i = 2; fs.existsSync(path.join(dir, n)); i++) n = `${base} (${i})${ext}`;
  return n;
}

// Guarda lo que llega en la petición directo al disco (sin cargarlo en memoria).
export function recibir(req, clientId, carpeta, sub, nombre) {
  return new Promise((resolve, reject) => {
    ensureFolders(clientId);
    const rel = [carpeta, sub].filter(Boolean).join('/');
    const { full: dir } = safePath(clientId, `${rel}/x`);
    const destDir = path.dirname(dir);
    fs.mkdirSync(destDir, { recursive: true });
    const final = nombreLibre(destDir, nombre);
    const tmp = path.join(destDir, `.subiendo-${Date.now()}`);
    const out = fs.createWriteStream(tmp);
    let bytes = 0, cancel = false;
    req.on('data', (c) => { bytes += c.length; if (bytes > MAX_BYTES && !cancel) { cancel = true; req.unpipe(out); out.destroy(); fs.rm(tmp, () => {}); reject(new Error('El archivo pesa más de 250 MB.')); } });
    req.pipe(out);
    out.on('finish', () => { if (cancel) return; fs.renameSync(tmp, path.join(destDir, final)); resolve({ nombre: final, ruta: `${rel}/${final}`, tam: bytes }); });
    out.on('error', (e) => { fs.rm(tmp, () => {}); reject(e); });
    req.on('aborted', () => { cancel = true; out.destroy(); fs.rm(tmp, () => {}); reject(new Error('Subida cancelada')); });
  });
}

export function crearSubcarpeta(clientId, carpeta, nombre) {
  const n = limpio(nombre);
  if (!n) throw new Error('Escribe un nombre');
  const { full } = safePath(clientId, `${carpeta}/${n}`);
  fs.mkdirSync(full, { recursive: true });
  return `${carpeta}/${n}`;
}

export function borrar(clientId, rel) {
  const { full, partes } = safePath(clientId, rel);
  if (partes.length === 1) throw new Error('Las carpetas principales no se borran');
  const st = fs.statSync(full);
  if (st.isDirectory()) { if (fs.readdirSync(full).length) throw new Error('La carpeta no está vacía'); fs.rmdirSync(full); }
  else fs.unlinkSync(full);
}

export function mover(clientId, rel, destino) {
  const { full } = safePath(clientId, rel);
  if (!fs.statSync(full).isFile()) throw new Error('Solo se pueden mover archivos');
  const { full: destDirFake } = safePath(clientId, `${destino}/x`);
  const destDir = path.dirname(destDirFake);
  fs.mkdirSync(destDir, { recursive: true });
  const final = nombreLibre(destDir, path.basename(full));
  fs.renameSync(full, path.join(destDir, final));
  return `${destino}/${final}`;
}

export function enviar(res, clientId, rel) {
  const { full } = safePath(clientId, rel);
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return res.status(404).end();
  const ext = path.extname(full).slice(1).toLowerCase();
  res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.type(MIME[ext] || 'application/octet-stream');
  res.sendFile(full);
}

// Resumen para los agentes + imágenes de referencia que pueden "ver".
export function resumenParaAgentes(clientId) {
  if (!clientId || !fs.existsSync(clientDir(clientId))) return '';
  const lineas = [];
  for (const c of listar(clientId)) {
    const todos = [...c.archivos, ...c.subcarpetas.flatMap((s) => s.archivos)];
    if (todos.length) lineas.push(`- ${c.carpeta}: ${todos.slice(0, 12).map((a) => a.ruta.split('/').slice(1).join('/')).join(', ')}${todos.length > 12 ? ` (+${todos.length - 12})` : ''}`);
  }
  return lineas.length ? `ARCHIVOS DEL CLIENTE (para usar o tomar de referencia; en video puedes usarlos con fondo tipo "archivo" y la ruta completa, ej. "Fotos y videos de producto/pan.jpg"):\n${lineas.join('\n')}` : '';
}

const b64cache = new Map();
export function imagenesReferencia(clientId, max = 4) {
  if (!clientId || !fs.existsSync(clientDir(clientId))) return [];
  const out = [];
  for (const c of ['Referencias visuales', 'Estilo de video', 'Logos']) {
    const ent = listar(clientId).find((x) => x.carpeta === c);
    for (const a of [...ent.archivos, ...ent.subcarpetas.flatMap((s) => s.archivos)]) {
      if (out.length >= max) break;
      if (!/\.(png|jpe?g|webp|gif)$/i.test(a.nombre) || a.tam > 3.5 * 1024 * 1024) continue;
      const k = `${clientId}/${a.ruta}@${a.mod}`;
      if (!b64cache.has(k)) b64cache.set(k, fs.readFileSync(safePath(clientId, a.ruta).full).toString('base64'));
      const ext = path.extname(a.nombre).slice(1).toLowerCase();
      out.push({ ruta: a.ruta, media_type: ext === 'jpg' ? 'image/jpeg' : `image/${ext}`, data: b64cache.get(k) });
    }
  }
  return out;
}

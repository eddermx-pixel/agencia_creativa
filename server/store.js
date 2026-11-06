// Persistencia simple en un archivo JSON (sin base de datos que instalar).
import fs from 'node:fs';
import path from 'node:path';

const FILE = path.resolve(process.env.DATA_FILE || 'data/db.json');
// Carpeta de datos (en Railway: el disco /data). Ahí también viven los archivos de cada cliente.
export const DATA_DIR = path.dirname(FILE);
const EMPTY = { agency: {}, clients: [], campaigns: [], pieces: [], requests: [], log: [], usage: [], jobs: [], memories: [], meetings: [], invites: [], courses: [] };

function load() {
  try {
    return { ...structuredClone(EMPTY), ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
  } catch {
    return structuredClone(EMPTY);
  }
}

export const db = load();

// Lo pendiente NO se borra al reiniciar: los agentes reales retoman su trabajo
// (ver runtime-claude.js → boot). El modo demo sí lo marca como interrumpido.
export function expirePending() {
  for (const r of db.requests) if (r.estado === 'pendiente') r.estado = 'expirada';
  for (const p of db.pieces) if (p.estado === 'pendiente') p.estado = 'expirada';
  for (const c of db.campaigns) if (c.estado === 'en_curso') c.estado = 'interrumpida';
  save();
}

let timer = null;
export function save() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE + '.tmp', JSON.stringify(db));
    fs.renameSync(FILE + '.tmp', FILE);
  }, 200);
}

export const newId = (prefix) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

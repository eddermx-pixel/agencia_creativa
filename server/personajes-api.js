// Estudio de personajes 3D (/personajes.html): sirve la librería al navegador y guarda los personajes que el dueño arma o aprueba.
// Los guardados se le pasan a Micho en la guía para que los use tal cual (ver personajesGuardados()).
import path from 'node:path';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { db, save, newId } from './store.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const lista = () => (db.agency.personajes ||= []);

export function personajesGuardados() {
  return lista().map((p) => `- ${p.nombre}${p.rol ? ` (${p.rol})` : ''}: crearPersonaje(${JSON.stringify(p.config)})${p.manos && (p.manos.izq || p.manos.der) ? ` + en las manos: ${JSON.stringify(p.manos)}` : ''}`).join('\n');
}

export function registrar(app) {
  // La librería y Three.js, tal como los ve Micho (personajes.js importa ./three.module.js)
  app.use('/lib3d', express.static(path.join(here, 'lib3d')));
  app.use('/lib3d', express.static(path.join(here, '..', 'node_modules', 'three', 'build')));

  app.get('/api/personajes', (req, res) => res.json(lista()));
  app.post('/api/personajes', (req, res) => {
    const b = req.body || {};
    const nombre = String(b.nombre || '').trim().slice(0, 60);
    if (!nombre || typeof b.config !== 'object' || !b.config) return res.status(400).json({ error: 'Falta el nombre o la configuración' });
    const p = { id: newId('pj'), nombre, rol: String(b.rol || '').slice(0, 80), config: b.config, manos: b.manos || {}, emocion: b.emocion || 'neutral', gesto: b.gesto || 'reposo', t: Date.now() };
    lista().push(p); save(); res.json(p);
  });
  app.delete('/api/personajes/:id', (req, res) => {
    db.agency.personajes = lista().filter((p) => p.id !== req.params.id); save(); res.json({ ok: true });
  });
}

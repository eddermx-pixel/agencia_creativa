// Catálogo de estilos virales: elegir los de cada marca y ver un ejemplo.
import { api, store, connect, esc } from './common.js';

const $ = (id) => document.getElementById(id);
let estilos = [];
let sugeridos = [];

async function init() {
  const r = await api('/api/estilos');
  estilos = r.estilos;
  $('nobroll').hidden = r.broll;
  render();
}

const cliente = () => store.clients.find((c) => c.id === $('cliente').value);

function render() {
  const sel = $('cliente'); const prev = sel.value;
  sel.innerHTML = store.clients.length ? store.clients.map((c) => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('') : '<option value="">(crea un cliente primero)</option>';
  if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
  const cl = cliente();
  const elegidos = new Set(cl?.estilosVideo || []);
  $('grid').replaceChildren(...estilos.map((e) => {
    const el = document.createElement('div');
    el.className = `st${elegidos.has(e.id) ? ' on' : ''}`;
    el.innerHTML = `${sugeridos.includes(e.id) ? '<span class="sug">⭐ Sugerido por Max</span>' : ''}
      <div class="e">${e.emoji}</div><div class="n">${esc(e.nombre)}</div>
      <div class="d">${esc(e.descripcion)}</div>
      <div class="m">💡 ${esc(e.porque)}</div>
      <div class="m">⏱️ ${esc(e.ritmo)} · ✨ ${esc(e.transiciones.join(', '))} · 💬 subtítulos por ${esc(e.subtitulos)}</div>
      <div class="acts"><button class="ver">▶️ Ver ejemplo</button>${cl ? `<button class="${elegidos.has(e.id) ? 'ok' : ''} tog">${elegidos.has(e.id) ? '✓ Elegido para esta marca' : '＋ Elegir para esta marca'}</button>` : ''}</div>`;
    el.querySelector('.ver').onclick = () => {
      $('dt').textContent = `${e.emoji} ${e.nombre}`;
      $('frame').src = `/player.html?estilo=${e.id}&cliente=${encodeURIComponent(cl?.id || '')}&embed=1`;
      $('dlg').showModal();
    };
    const tog = el.querySelector('.tog');
    if (tog) tog.onclick = async () => {
      const set = new Set(cl.estilosVideo || []);
      set.has(e.id) ? set.delete(e.id) : set.add(e.id);
      try { await api(`/api/clients/${cl.id}`, { estilosVideo: [...set] }); } catch (err) { alert(err.message); }
    };
    return el;
  }));
}

$('cliente').onchange = () => { sugeridos = []; $('msg').textContent = ''; render(); };
$('sugerir').onclick = async () => {
  const cl = cliente(); if (!cl) return;
  sugeridos = (await api(`/api/clients/${cl.id}/sugerir-estilos`, {})).sugeridos;
  $('msg').textContent = `Max sugiere para ${cl.nombre}: ${sugeridos.map((id) => estilos.find((e) => e.id === id)?.nombre).join(', ')}`;
  render();
};
$('dx').onclick = () => $('dlg').close();
$('dlg').addEventListener('close', () => ($('frame').src = 'about:blank'));

let ready = false;
connect((type) => { if (!ready) { ready = true; init(); } else if (type === 'client') render(); });
